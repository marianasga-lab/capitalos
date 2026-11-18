/** Ícono: monograma "C" sobre tinta, con una línea de base (retícula). */
export function AppIconArt({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, background: "#161614", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
      <div style={{ fontSize: size * 0.62, color: "#f0efec", fontWeight: 600, letterSpacing: -size * 0.03, lineHeight: 1, marginTop: -size * 0.06 }}>C</div>
      <div style={{ position: "absolute", left: size * 0.22, right: size * 0.22, bottom: size * 0.2, height: Math.max(2, size * 0.02), background: "#3987e5" }} />
    </div>
  );
}
