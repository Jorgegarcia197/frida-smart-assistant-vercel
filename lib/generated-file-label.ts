/**
 * User-facing file type line for generated downloads.
 * Office Open XML is often served as application/zip; we prefer extension-based labels.
 */
export function getGeneratedFileTypeSubtitle(
  filename: string | undefined,
  mimeType: string | undefined,
): string | undefined {
  const ext = filename?.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'pptx':
      return 'PowerPoint presentation';
    case 'docx':
      return 'Word document';
    case 'xlsx':
      return 'Excel workbook';
    case 'pdf':
      return 'PDF document';
    case 'csv':
      return 'CSV file';
    default:
      break;
  }

  const mime = mimeType?.toLowerCase().trim();
  if (!mime || mime === 'application/octet-stream') {
    return undefined;
  }

  return mime;
}
