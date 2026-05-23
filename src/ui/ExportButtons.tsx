type Props = { disabled: boolean };
export function ExportButtons({ disabled }: Props) {
  return (
    <div className="export-buttons">
      <button disabled={disabled}>Download STL (.zip)</button>
      <button disabled={disabled}>Download SVG (.zip)</button>
    </div>
  );
}
