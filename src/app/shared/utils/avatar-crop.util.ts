import {
  AVATAR_CROP_VIEWPORT_PX,
  AVATAR_CROP_ZOOM_MAX,
  AVATAR_CROP_ZOOM_MIN,
} from '@shared/constants/avatar-crop.constants';

export interface AvatarCropParams {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export function computeCoverScale(
  imageWidth: number,
  imageHeight: number,
  viewportSize: number = AVATAR_CROP_VIEWPORT_PX,
): number {
  return Math.max(viewportSize / imageWidth, viewportSize / imageHeight);
}

export function effectiveScale(coverScale: number, zoom: number): number {
  const clampedZoom = clamp(zoom, AVATAR_CROP_ZOOM_MIN, AVATAR_CROP_ZOOM_MAX);
  return coverScale * clampedZoom;
}

export function clampPan(
  panX: number,
  panY: number,
  imageWidth: number,
  imageHeight: number,
  scale: number,
  viewportSize: number = AVATAR_CROP_VIEWPORT_PX,
): { readonly panX: number; readonly panY: number } {
  const scaledW = imageWidth * scale;
  const scaledH = imageHeight * scale;
  const maxPanX = Math.max(0, (scaledW - viewportSize) / 2);
  const maxPanY = Math.max(0, (scaledH - viewportSize) / 2);

  return {
    panX: clamp(panX, -maxPanX, maxPanX),
    panY: clamp(panY, -maxPanY, maxPanY),
  };
}

export function cropAvatarToBlob(
  image: HTMLImageElement,
  params: AvatarCropParams,
  outputSize: number,
  viewportSize: number = AVATAR_CROP_VIEWPORT_PX,
): Promise<Blob> {
  const coverScale = computeCoverScale(image.naturalWidth, image.naturalHeight, viewportSize);
  const scale = effectiveScale(coverScale, params.zoom);
  const { panX, panY } = clampPan(
    params.panX,
    params.panY,
    image.naturalWidth,
    image.naturalHeight,
    scale,
    viewportSize,
  );

  const imgLeft = viewportSize / 2 - (image.naturalWidth * scale) / 2 + panX;
  const imgTop = viewportSize / 2 - (image.naturalHeight * scale) / 2 + panY;

  const sx = (0 - imgLeft) / scale;
  const sy = (0 - imgTop) / scale;
  const sw = viewportSize / scale;
  const sh = viewportSize / scale;

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('Canvas non disponibile'));
  }

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outputSize, outputSize);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('Export immagine non riuscito'));
      },
      'image/jpeg',
      0.92,
    );
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
