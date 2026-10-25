/** Phosphor: the monitor's casing, scanlines and curved glass in front of the play screen. */
export default function PhosphorScene() {
  return (
    <div data-theme-scene="front" aria-hidden="true">
      <div className="phosphor-bezel">
        <div className="phosphor-scanlines" />
        <div className="phosphor-glass" />
      </div>
      <div className="phosphor-led" />
    </div>
  );
}
