import type { Attachment } from '@/lib/types';
import { CrossSmallIcon } from './icons';
import { Button } from './ui/button';
import { Loader } from './elements/loader';

function getFileBadge(name?: string, contentType?: string): string {
  const ext = name?.split('.').pop()?.toLowerCase();
  if (ext && ext.length <= 5) return ext.toUpperCase();

  const mime = contentType?.toLowerCase() ?? '';
  if (mime.endsWith('presentationml.presentation')) return 'PPTX';
  if (mime.endsWith('wordprocessingml.document')) return 'DOCX';
  if (mime.endsWith('spreadsheetml.sheet')) return 'XLSX';
  if (mime === 'application/pdf') return 'PDF';
  return 'FILE';
}

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
  onEdit,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
  onEdit?: () => void;
}) => {
  const { name, url, contentType } = attachment;

  return (
    <div
      data-testid="input-attachment-preview"
      className="group relative w-16 h-16 rounded-lg overflow-hidden bg-muted border"
    >
      {contentType?.startsWith('image') ? (
        <img
          src={url}
          alt={name ?? 'An image attachment'}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {getFileBadge(name, contentType)}
        </div>
      )}

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader size={16} />
        </div>
      )}

      {onRemove && !isUploading && (
        <Button
          onClick={onRemove}
          size="sm"
          variant="destructive"
          className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity size-4 p-0 rounded-full"
        >
          <CrossSmallIcon size={8} />
        </Button>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] px-1 py-0.5 truncate">
        {name}
      </div>
    </div>
  );
};
