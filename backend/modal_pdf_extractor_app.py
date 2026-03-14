"""
Modal App: PDF Text Extraction with Docling
============================================
Serverless PDF extraction that offloads heavy Docling ML models
to Modal Labs, freeing Railway from memory constraints.

Deploy with:
    modal deploy backend/modal_pdf_extractor_app.py

The webhook URL will be:
    https://<workspace>--huntzen-pdf-extractor-extract-pdf-text.modal.run

Set this URL as MODAL_PDF_EXTRACT_URL in Railway environment variables.
"""

import modal

app = modal.App("huntzen-pdf-extractor")


def _download_docling_models():
    """
    Force Docling model download at image build time.

    DocumentConverter() alone is lazy — models are only fetched when .convert()
    is actually called. We run a minimal PDF conversion to pull all HuggingFace
    weights (~1-2 GB) into the image layer so cold starts are near-instant.
    """
    import os
    import tempfile
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    # Minimal valid single-page PDF with a text layer
    minimal_pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n"
        b"   /Resources << /Font << /F1 << /Type /Font /Subtype /Type1\n"
        b"   /BaseFont /Helvetica >> >> >>\n"
        b"   /Contents 4 0 R >>\nendobj\n"
        b"4 0 obj\n<< /Length 44 >>\nstream\n"
        b"BT\n/F1 12 Tf\n100 700 Td\n(Hello World) Tj\nET\n"
        b"endstream\nendobj\n"
        b"xref\n0 5\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000290 00000 n \n"
        b"trailer\n<< /Size 5 /Root 1 0 R >>\n"
        b"startxref\n385\n%%EOF"
    )

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(minimal_pdf)
        fname = f.name

    try:
        opts = PdfPipelineOptions(do_ocr=False)
        converter = DocumentConverter(
            format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)}
        )
        result = converter.convert(fname)
        chars = len(result.document.export_to_markdown())
        print(f"✅ Docling models downloaded and cached ({chars} chars extracted)")
    finally:
        os.unlink(fname)


docling_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "libgl1-mesa-glx",  # OpenCV dependency
        "libglib2.0-0",     # GTK dependency
    )
    .pip_install(
        "docling>=2.0.0",  # Aligné avec Railway (pyproject.toml: docling>=2.0.0)
        "fastapi[standard]>=0.115.0",
        "pypdf>=3.0.0",    # Fallback when Docling returns insufficient text
    )
    # Pre-bake Docling models into the image layer at deploy time.
    # Without this, each cold start re-downloads ~1-2 GB → 30-60s latency.
    # With this, cold starts load models from local disk in ~1-2s.
    .run_function(_download_docling_models)
)


@app.function(
    image=docling_image,
    cpu=2,
    memory=4096,        # 4 GB — Docling layout models need ~2-4 GB
    timeout=120,        # 2 min max per extraction
    min_containers=1,   # Always keep 1 warm container — eliminates cold starts (~$3-5/month)
)
@modal.fastapi_endpoint(method="POST")
async def extract_pdf_text(body: dict) -> dict:
    """
    Extract text from PDF bytes using Docling.

    Input (JSON body):
        { "pdf_bytes": "<base64-encoded PDF bytes>" }

    Output (JSON):
        { "success": true, "text": "<markdown text>" }
        { "success": false, "error": "<error message>" }
    """
    import base64
    import os
    import tempfile
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.datamodel.base_models import InputFormat

    pdf_bytes_b64 = body.get("pdf_bytes")
    if not pdf_bytes_b64:
        return {"success": False, "error": "Missing required field: pdf_bytes"}

    try:
        pdf_bytes = base64.b64decode(pdf_bytes_b64)
    except Exception as e:
        return {"success": False, "error": f"Invalid base64 encoding: {str(e)}"}

    tmp_path = None
    try:
        # Write bytes to temp file (docling requires a file path)
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        # do_ocr=False: text-based CVs don't need OCR, avoids downloading 40MB RapidOCR models
        pdf_options = PdfPipelineOptions(do_ocr=False)
        converter = DocumentConverter(
            format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pdf_options)}
        )
        result = converter.convert(tmp_path)
        text = result.document.export_to_markdown()

        # pypdf fallback — same pattern as main_agent.py:extract_text_from_pdf()
        # Docling with do_ocr=False can silently return minimal text for design-heavy PDFs
        if not text or len(text.strip()) < 100:
            print(f"⚠️ Docling returned only {len((text or '').strip())} chars, trying pypdf fallback")
            try:
                import io as _io
                from pypdf import PdfReader
                reader = PdfReader(_io.BytesIO(pdf_bytes))
                fallback_text = "\n".join(
                    page.extract_text() or "" for page in reader.pages
                ).strip()
                if fallback_text and len(fallback_text) >= 50:
                    print(f"✅ pypdf fallback succeeded: {len(fallback_text)} chars")
                    return {"success": True, "text": fallback_text}
            except Exception as pypdf_exc:
                print(f"⚠️ pypdf fallback also failed: {pypdf_exc}")
            return {
                "success": False,
                "error": f"All extraction failed ({len((text or '').strip())} chars from Docling, pypdf also failed)",
            }

        return {"success": True, "text": text}

    except Exception as e:
        return {"success": False, "error": f"Docling extraction failed: {str(e)}"}

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
