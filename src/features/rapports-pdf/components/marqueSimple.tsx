// src/features/rapports-pdf/components/marque.tsx
//
// Éléments communs aux PDF du Service de la scolarité : design simple,
// texte noir sur fond blanc, quelques touches de couleur.

export const COULEURS = {
    noir: '#000000',
    bleu: '#2563eb',
    violet: '#7c3aed',
    vert: '#16a34a',
    orange: '#f59e0b',
    rouge: '#dc2626',
    gris: '#e5e7eb',
  };
  
  export const PASTELS = ['#dbeafe', '#dcfce7', '#fef9c3', '#f3e8ff', '#ffedd5', '#cffafe', '#fce7f3'];
  
  export function formaterDateHeure(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', {
      timeZone: 'Africa/Douala',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  
  // En-tête répété en haut de chaque page (placé dans un <thead>).
  export function EnteteSimple() {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5mm',
          borderBottom: '1.5px solid #000',
          paddingBottom: '3mm',
          marginBottom: '4mm',
          fontWeight: 'normal',
          textAlign: 'left',
        }}
      >
        <img
          src="/logo-cenulape.png"
          alt="Logo CENULAPE"
          style={{ width: '20mm', height: '20mm', objectFit: 'contain' }}
        />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.08em' }}>
            CENTRE UNIVERSITAIRE LA PERLE (CENULAPE)
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '0.04em', marginTop: '1mm' }}>
            SERVICE DE LA SCOLARITÉ
          </div>
        </div>
        <div style={{ width: '20mm' }} />
      </div>
    );
  }
  
  // Pied de page répété (placé dans un <tfoot>).
  export function PiedSimple({ genereLe }: { genereLe: string }) {
    return (
      <div
        style={{
          borderTop: '1px solid #000',
          paddingTop: '1.5mm',
          marginTop: '4mm',
          fontSize: '8.5px',
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 'normal',
        }}
      >
        <span>CENULAPE · BP 760 Yassa, Douala · Tél : 658 09 34 70 · info@laperle-sup.com</span>
        <span>Édité le {formaterDateHeure(genereLe)}</span>
      </div>
    );
  }
  
  // Corps d'un document : tableau mono-colonne dont thead/tfoot se
  // répètent sur chaque page imprimée ; le contenu s'écoule librement.
  export function DocumentSimple({
    genereLe,
    children,
  }: {
    genereLe: string;
    children: React.ReactNode;
  }) {
    return (
      <div
        className="rapport-pdf"
        style={{
          width: '210mm',
          boxSizing: 'border-box',
          padding: '0 12mm',
          background: '#fff',
          color: '#000',
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '11px',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: 0, fontWeight: 'normal' }}>
                <EnteteSimple />
              </th>
            </tr>
          </thead>
          <tfoot>
            <tr>
              <td style={{ padding: 0 }}>
                <PiedSimple genereLe={genereLe} />
              </td>
            </tr>
          </tfoot>
          <tbody>
            <tr>
              <td style={{ padding: 0 }}>{children}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }
  
  export function Titre({ titre, sous }: { titre: string; sous?: string }) {
    return (
      <div style={{ textAlign: 'center', margin: '2mm 0 4mm' }}>
        <div style={{ fontSize: '18px', fontWeight: 700 }}>{titre}</div>
        {sous && <div style={{ fontSize: '12px', marginTop: '1mm' }}>{sous}</div>}
      </div>
    );
  }
  
  export function SousTitre({ texte, couleur }: { texte: string; couleur: string }) {
    return (
      <div
        style={{
          fontSize: '12px',
          fontWeight: 700,
          margin: '6mm 0 2mm',
          paddingLeft: '2mm',
          borderLeft: `3px solid ${couleur}`,
        }}
      >
        {texte}
      </div>
    );
  }