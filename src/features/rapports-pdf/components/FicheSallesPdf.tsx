// src/features/rapports-pdf/components/FicheSallesPdf.tsx
//
// Fiche de répartition des salles — A4 portrait, tableau simple : une
// bande grise par jour, lignes en pastel (une couleur par salle, comme
// dans l'emploi du temps). L'en-tête se répète sur chaque page.

import type { FicheSalles } from '../api';
import { formaterDate } from '../api';
import { COULEURS, DocumentSimple, PASTELS, Titre } from './marqueSimple';

const cellule: React.CSSProperties = {
  border: '1px solid #000',
  padding: '1.6mm 2mm',
  textAlign: 'left',
  fontSize: '10px',
  verticalAlign: 'top',
};

export default function FicheSallesPdf({ fiche }: { fiche: FicheSalles }) {
  // Une couleur stable par salle.
  const couleurSalle = new Map<string, string>();
  for (const j of fiche.jours) {
    for (const l of j.lignes) {
      if (l.salleCode !== 'Non attribuée' && !couleurSalle.has(l.salleCode)) {
        couleurSalle.set(l.salleCode, PASTELS[couleurSalle.size % PASTELS.length]);
      }
    }
  }

  return (
    <DocumentSimple genereLe={fiche.genereLe}>
      <Titre titre="RÉPARTITION DES SALLES" sous={fiche.libelleSemaine} />
      <div style={{ fontSize: '10px', textAlign: 'center', marginBottom: '3mm' }}>
        {fiche.nbSeances} séances · {fiche.nbSallesUtilisees} salles utilisées ·{' '}
        {fiche.nbSansSalle} sans salle
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {[
              ['Créneau', '14%'],
              ['Salle', '16%'],
              ['Filières', '38%'],
              ['Cours', '32%'],
            ].map(([t, w]) => (
              <th
                key={t}
                style={{ ...cellule, width: w, background: '#f1f1f1', fontWeight: 700 }}
              >
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fiche.jours.length === 0 && (
            <tr>
              <td colSpan={4} style={{ ...cellule, textAlign: 'center', padding: '8mm' }}>
                Aucune séance programmée cette semaine.
              </td>
            </tr>
          )}
          {fiche.jours.map((jour) => [
            <tr key={`j-${jour.jour}`} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
              <td
                colSpan={4}
                style={{ ...cellule, background: COULEURS.gris, fontWeight: 700, fontSize: '10.5px' }}
              >
                {jour.jour.toUpperCase()} {formaterDate(jour.date, { day: 'numeric', month: 'long' })}
              </td>
            </tr>,
            ...jour.lignes.map((l, i) => {
              const sans = l.salleCode === 'Non attribuée';
              return (
                <tr
                  key={`${jour.jour}-${i}`}
                  style={{
                    breakInside: 'avoid',
                    pageBreakInside: 'avoid',
                    background: sans ? '#fee2e2' : couleurSalle.get(l.salleCode),
                  }}
                >
                  <td style={cellule}>{l.creneau}</td>
                  <td style={cellule}>
                    <b>{l.salleCode}</b>
                    {l.capacite != null && (
                      <>
                        <br />
                        {l.capacite} pl.
                      </>
                    )}
                  </td>
                  <td style={cellule}>{l.filieres.join(', ')}</td>
                  <td style={cellule}>
                    {l.cours.map((c, k) => (
                      <div key={k}>{c}</div>
                    ))}
                  </td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
    </DocumentSimple>
  );
}