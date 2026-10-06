/** Phosphor: curved CRT glass and a dark bezel in front of the play screen. */
export default function PhosphorScene() {
  return (
    <div data-theme-scene="front" aria-hidden="true">
      <div className="phosphor-glass" />
      <div className="phosphor-bezel" />
    </div>
  );
}
