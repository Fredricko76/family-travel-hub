// Native builds use the system camera via expo-image-picker instead; the
// web build swaps in WebCamera.web.tsx automatically.
type Props = {
  onCapture: (blob: Blob, width: number, height: number) => void;
  onCancel: () => void;
  onUnavailable: (reason: string) => void;
};

export function WebCamera(_props: Props) {
  return null;
}
