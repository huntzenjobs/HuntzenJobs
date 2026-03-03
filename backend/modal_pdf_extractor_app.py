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

# Image identique au huntzen-cv-processor (même version docling = même comportement)
docling_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "libgl1-mesa-glx",  # OpenCV dependency
        "libglib2.0-0",     # GTK dependency
    )
    .pip_install(
        "docling>=2.0.0",  # Aligné avec Railway (pyproject.toml: docling>=2.0.0)
        "fastapi[standard]>=0.115.0",
    )
)


@app.function(
    image=docling_image,
    cpu=2,
    memory=4096,   # 4GB — docling needs ~2-4GB for ML models
    timeout=120,   # 2 min max per extraction
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
    from docling.backend.pypdfium2_backend import PyPdfiumDocumentBackend

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

        # PyPdfiumDocumentBackend: évite enforce_same_font=True du backend V4
        # qui casse les mots dans les CVs design-heavy (ex: "Data2inn ov")
        # do_ocr=False: évite le téléchargement de 40MB de modèles RapidOCR au cold start
        pdf_options = PdfPipelineOptions(
            do_ocr=False,
            do_table_structure=False,
            generate_page_images=False,
            generate_picture_images=False,
            generate_table_images=False,
        )
        converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(
                    pipeline_options=pdf_options,
                    backend=PyPdfiumDocumentBackend,
                )
            }
        )
        result = converter.convert(tmp_path)
        text = result.document.export_to_markdown()

        # Threshold aligned with backend Railway validation (cv_adapter.py: len < 100)
        if not text or len(text.strip()) < 100:
            return {"success": False, "error": f"Docling extracted insufficient text ({len(text.strip())} chars, min 100 required)"}

        return {"success": True, "text": text}

    except Exception as e:
        return {"success": False, "error": f"Docling extraction failed: {str(e)}"}

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
