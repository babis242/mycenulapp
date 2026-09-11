// Petit composant réutilisable pour les modules pas encore construits —
// évite les pages blanches pendant qu'on avance scénario par scénario.
export default function PlaceholderPage({
  title,
  scenario,
}: {
  title: string;
  scenario: string;
}) {
  return (
    <div className="max-w-4xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-2">{title}</p>
      <p className="text-sm text-gray-400">
        Cet écran sera construit au {scenario}.
      </p>
    </div>
  );
}
