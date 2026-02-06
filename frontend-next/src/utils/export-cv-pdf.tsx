/**
 * Export CV Analysis Results to PDF
 * Uses @react-pdf/renderer for PDF generation
 */

import { pdf } from '@react-pdf/renderer';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// PDF Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    borderBottom: '2px solid #2563eb',
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  section: {
    marginTop: 15,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: 5,
  },
  scoreContainer: {
    backgroundColor: '#eff6ff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  scoreText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2563eb',
    textAlign: 'center',
  },
  scoreLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 5,
  },
  breakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 11,
    color: '#374151',
  },
  breakdownValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  listItem: {
    fontSize: 10,
    color: '#4b5563',
    marginBottom: 5,
    paddingLeft: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
    borderTop: '1px solid #e5e7eb',
    paddingTop: 10,
  },
});

interface CVAnalysisResult {
  ats_score: {
    overall_score: number;
    formatting_score: number;
    keywords_score: number;
    structure_score: number;
    readability_score: number;
  };
  strengths: string[];
  improvements: string[];
  missing_sections?: string[];
  keywords_found?: string[];
  keywords_missing?: string[];
  analysis_language: 'fr' | 'en';
  processed_at: string;
}

// PDF Document Component
const CVAnalysisPDFDocument = ({ result }: { result: CVAnalysisResult }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Analyse de CV - Résultats</Text>
        <Text style={styles.subtitle}>
          Généré le {new Date(result.processed_at).toLocaleDateString('fr-FR')}
        </Text>
      </View>

      {/* Overall Score */}
      <View style={styles.scoreContainer}>
        <Text style={styles.scoreText}>{result.ats_score.overall_score}/100</Text>
        <Text style={styles.scoreLabel}>Score ATS Global</Text>
      </View>

      {/* Score Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Détails du Score</Text>
        <View style={styles.breakdown}>
          <Text style={styles.breakdownLabel}>Format</Text>
          <Text style={styles.breakdownValue}>{result.ats_score.formatting_score}/100</Text>
        </View>
        <View style={styles.breakdown}>
          <Text style={styles.breakdownLabel}>Mots-clés</Text>
          <Text style={styles.breakdownValue}>{result.ats_score.keywords_score}/100</Text>
        </View>
        <View style={styles.breakdown}>
          <Text style={styles.breakdownLabel}>Structure</Text>
          <Text style={styles.breakdownValue}>{result.ats_score.structure_score}/100</Text>
        </View>
        <View style={styles.breakdown}>
          <Text style={styles.breakdownLabel}>Lisibilité</Text>
          <Text style={styles.breakdownValue}>{result.ats_score.readability_score}/100</Text>
        </View>
      </View>

      {/* Strengths */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Points Forts</Text>
        {result.strengths.map((strength, index) => (
          <Text key={index} style={styles.listItem}>
            • {strength}
          </Text>
        ))}
      </View>

      {/* Improvements */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Points à Améliorer</Text>
        {result.improvements.map((improvement, index) => (
          <Text key={index} style={styles.listItem}>
            • {improvement}
          </Text>
        ))}
      </View>

      {/* Missing Sections */}
      {result.missing_sections && result.missing_sections.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sections Manquantes</Text>
          {result.missing_sections.map((section, index) => (
            <Text key={index} style={styles.listItem}>
              • {section}
            </Text>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text>Généré par HuntZen - Plateforme d'assistance à la recherche d'emploi</Text>
        <Text>huntzen.fr</Text>
      </View>
    </Page>
  </Document>
);

/**
 * Export CV analysis results to PDF file
 * @param result - CV analysis result object
 * @param fileName - Optional custom filename (default: cv-analysis-{date}.pdf)
 */
export async function exportCVAnalysisToPDF(
  result: CVAnalysisResult,
  fileName?: string
): Promise<void> {
  try {
    // Generate PDF
    const blob = await pdf(<CVAnalysisPDFDocument result={result} />).toBlob();

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || `cv-analysis-${new Date().toISOString().split('T')[0]}.pdf`;

    // Trigger download
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('✅ PDF exported successfully');
  } catch (error) {
    console.error('Failed to export PDF:', error);
    throw new Error('Échec de l\'export PDF');
  }
}
