// PDF du programme des examens — une page par spécialité, même identité visuelle
// que l'emploi du temps des cours (en-tête, filigrane, titres rouges, barre de pause verte).
import { Fragment } from 'react';
import { estSpecialiteHND, dateFr, jourDeDate, lignesPourSpecialite, minutesVersHeure, nomLigne, type Examen, type LigneExamen, type MatiereExamen } from '../api';

export const STYLE_PDF_EXAMEN = `
.exp-page{position:relative;background:#fff;color:#000;padding:8mm 10mm;font-family:'Nunito',Arial,sans-serif;overflow:hidden}
.exp-wm{position:absolute;top:50%;left:50%;width:420px;opacity:.07;transform:translate(-50%,-50%);pointer-events:none}
.exp-rel{position:relative}
.exp-hd{display:grid;grid-template-columns:minmax(0,1fr) 30mm minmax(0,1fr);align-items:start;margin-bottom:6px}
.exp-hd>div{text-align:center;min-width:0}
.exp-hd>div:nth-child(2){display:flex;justify-content:center}
.exp-b{color:#2563eb;font-weight:700;font-size:14px}.exp-s{font-weight:700;font-size:12px}
.exp-logo{width:26mm;height:26mm;object-fit:contain;display:block;margin:0 auto}
.exp-aut{text-align:center;font-style:italic;font-weight:700;font-size:12px;margin:4px 0 8px}
.exp-t1{text-align:center;color:#dc2626;font-weight:900;font-size:19px;text-transform:uppercase;line-height:1.25}
.exp-t2{text-align:center;color:#dc2626;font-weight:900;font-size:19px;margin-bottom:2px;text-transform:uppercase;line-height:1.25}
.exp-meta{display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin:8px 0}
.exp-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;margin-bottom:8px}
.exp-table th,.exp-table td{border:1px solid #000;padding:6px 8px;text-align:center;vertical-align:middle;background:#fff}
.exp-table th{font-weight:800;font-size:12px;letter-spacing:.8px;text-transform:uppercase;padding:7px 8px}
.exp-table thead{display:table-header-group}
.exp-table tr{break-inside:avoid}
.exp-dj b{font-size:14px;font-weight:900;letter-spacing:.4px}
.exp-dj span{display:block;font-size:12px;font-weight:700;margin-top:1px}
.exp-h{color:#dc2626;font-weight:800;white-space:nowrap;font-size:13.5px}
.exp-m{font-weight:800;font-size:14px;text-transform:uppercase}
.exp-sl{font-weight:700;color:#374151}
.exp-pause td.exp-pz{background:#f3f4f6;font-weight:800;letter-spacing:1px;padding:3px}
.exp-nb{font-size:10.5px;font-weight:700;line-height:1.35}
.exp-sign{display:flex;justify-content:space-between;margin-top:14px;font-size:12px;font-weight:800}
`;

const JOURS_EN: Record<string, string> = {
  LUNDI: 'MONDAY', MARDI: 'TUESDAY', MERCREDI: 'WEDNESDAY', JEUDI: 'THURSDAY', VENDREDI: 'FRIDAY', SAMEDI: 'SATURDAY', DIMANCHE: 'SUNDAY',
};

// Les spécialités HND sont anglophones : tout le document est en anglais.
const TEXTES = {
  fr: {
    autorisation: '{tx.autorisation}',
    siteWeb: 'Site web', programme: 'PROGRAMME DES EXAMENS', niveau: 'NIVEAU', semestre: 'SEMESTRE', annee: 'ANNEE',
    du: 'Du', au: 'au', date: 'Date', horaire: 'Horaire', matiere: 'Matière', salle: 'Salle', pause: 'PAUSE',
    aucune: 'Aucune épreuve programmée.',
    nb1: "NB : 1- Les étudiants doivent être présents 15 minutes avant le début de chaque épreuve, munis de leur carte d'étudiant.",
    nb2: "2- Tout retard au-delà de 15 minutes entraîne l'interdiction de composer. Les téléphones portables sont interdits en salle d'examen.",
  },
  en: {
    autorisation: 'Authorization N°: 17-09460/L/MINESUP/SG/DDES/ESUP/SDA/OAGS of 20 September 2017',
    siteWeb: 'Website', programme: 'EXAMINATION TIMETABLE', niveau: 'LEVEL', semestre: 'SEMESTER', annee: 'ACADEMIC YEAR',
    du: 'From', au: 'to', date: 'Date', horaire: 'Time', matiere: 'Subject', salle: 'Room', pause: 'BREAK',
    aucune: 'No exam scheduled.',
    nb1: 'NB: 1- Students must be present 15 minutes before the start of each exam, with their student ID card.',
    nb2: '2- Any student arriving more than 15 minutes late will not be allowed to sit the exam. Mobile phones are not allowed in the examination room.',
  },
};

export default function ExamenPdf({
  examen, lignes, matieres, specialites,
}: {
  examen: Examen; lignes: LigneExamen[]; matieres: MatiereExamen[]; specialites: { id: string; nom: string; cycle?: string }[];
}) {
  const niveauDe = (sem: string) => {
    const n = Number(sem.replace(/\D/g, ''));
    return n ? Math.ceil(n / 2) : null;
  };
  const niveau = niveauDe(examen.semestre);

  return (
    <>
      <style>{STYLE_PDF_EXAMEN}</style>
      {specialites.map((sp, idx) => {
        const en = estSpecialiteHND(sp);
        const tx = en ? TEXTES.en : TEXTES.fr;
        const jour = (d: string) => (en ? JOURS_EN[jourDeDate(d).toUpperCase()] ?? jourDeDate(d) : jourDeDate(d));
        const ls = lignesPourSpecialite(lignes, matieres, sp.id);
        const dates = Array.from(new Set(ls.map((l) => l.date)));
        const periode = dates.length > 0 ? `${tx.du} ${dateFr(dates[0])} ${tx.au} ${dateFr(dates[dates.length - 1])}` : '';
        return (
          <div key={sp.id} className="exp-page" style={{ pageBreakAfter: idx < specialites.length - 1 ? 'always' : 'auto' }}>
            <img className="exp-wm" src="/logo-cenulape.png" alt="" />
            <div className="exp-rel">
              <div className="exp-hd">
                <div>
                  <div className="exp-b">CENTRE UNIVERSITAIRE LA PERLE</div>
                  <div className="exp-b" style={{ marginBottom: 6 }}>(CENULAPE)</div>
                  <div className="exp-s">BP : 760 YASSA DOUALA</div>
                  <div className="exp-s">TEL : 658 09 34 70</div>
                </div>
                <div><img className="exp-logo" src="/logo-cenulape.png" alt="Logo CENULAPE" /></div>
                <div>
                  <div className="exp-b">THE PEARL UNIVERSITY CENTER</div>
                  <div className="exp-b" style={{ marginBottom: 6 }}>(CENULAPE)</div>
                  <div className="exp-s">Email : <u style={{ color: '#2563eb' }}>info@laperle-sup.com</u></div>
                  <div className="exp-s">{tx.siteWeb} : <u style={{ color: '#2563eb' }}>www.laperle-sup.com</u></div>
                </div>
              </div>
              <div className="exp-aut">{tx.autorisation}</div>
              <div className="exp-t1">{tx.programme} — {examen.titre}</div>
              <div className="exp-t2">{sp.nom}{niveau ? ` (${tx.niveau} ${niveau})` : ''}</div>
              <div className="exp-meta">
                <span>{tx.semestre} {examen.semestre}</span>
                <span>{tx.annee} : {examen.anneeAcademique}</span>
                <span>{periode.toUpperCase()}</span>
              </div>

              <table className="exp-table">
                <thead>
                  <tr><th style={{ width: '15%' }}>{tx.date}</th><th style={{ width: '20%' }}>{tx.horaire}</th><th>{tx.matiere}</th><th style={{ width: '16%' }}>{tx.salle}</th></tr>
                </thead>
                <tbody>
                  {ls.length === 0 && <tr><td colSpan={4} style={{ padding: 14 }}>{tx.aucune}</td></tr>}
                  {dates.map((d) => {
                    const duJour = ls.filter((l) => l.date === d);
                    return duJour.map((l, i) => (
                      <Fragment key={l.id}>
                        {l.type === 'pause' ? (
                          <tr className="exp-pause">
                            {i === 0 && <td className="exp-dj" rowSpan={duJour.length}><b>{jour(d)}</b><span>{dateFr(d)}</span></td>}
                            <td className="exp-pz" colSpan={3}>{tx.pause} · {minutesVersHeure(l.debutMin)} - {minutesVersHeure(l.debutMin + l.dureeMin)}</td>
                          </tr>
                        ) : (
                          <tr>
                            {i === 0 && <td className="exp-dj" rowSpan={duJour.length}><b>{jour(d)}</b><span>{dateFr(d)}</span></td>}
                            <td className="exp-h">{minutesVersHeure(l.debutMin)} - {minutesVersHeure(l.debutMin + l.dureeMin)}</td>
                            <td className="exp-m">{nomLigne(l)}</td>
                            <td className="exp-sl">{l.salle ?? ''}</td>
                          </tr>
                        )}
                      </Fragment>
                    ));
                  })}
                </tbody>
              </table>

              <div className="exp-nb">
                {tx.nb1}
                <br />
                {tx.nb2}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}