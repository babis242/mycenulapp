// src/features/rapports-pdf/components/RapportPeriodePdf.tsx
//
// Rapport hebdomadaire / mensuel — A4 portrait sur fond blanc, sans
// limite de pages :
//   1. en-tête + chiffres clés + courbe heures programmées/validées ;
//   2. courbe retards/absences + répartition des heures + synthèse ;
//   3. enseignants absents (nouvelle page) ;
//   4. enseignants en retard (nouvelle page).

import type { ReactNode } from 'react';
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  UserX,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import type { LigneEnseignant, RapportPeriode } from '../api';
import { CourbesLissees, Donut, formaterNombre } from './graphiques';
import { COULEURS, Carte, EnteteCompact, EnteteHero, PageA4, PiedDePage } from './marque';

function Kpi({
  icone,
  valeur,
  label,
  sous,
  c1,
  c2,
}: {
  icone: ReactNode;
  valeur: string;
  label: string;
  sous?: string;
  c1: string;
  c2: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: '4mm',
        padding: '3.4mm 3.2mm',
        background: `linear-gradient(160deg, ${c1}14, ${c2}26)`,
        border: `1px solid ${c1}40`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: '-6mm',
          top: '-6mm',
          width: '18mm',
          height: '18mm',
          borderRadius: '50%',
          background: `${c1}18`,
        }}
      />
      <div
        style={{
          width: '9mm',
          height: '9mm',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${c1}, ${c2})`,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {icone}
      </div>
      <div
        style={{
          fontSize: '26px',
          fontWeight: 900,
          color: c1,
          lineHeight: 1,
          marginTop: '2.6mm',
          position: 'relative',
        }}
      >
        {valeur}
      </div>
      <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#374151', marginTop: '1.2mm', position: 'relative' }}>
        {label}
      </div>
      {sous && (
        <div style={{ fontSize: '8.5px', fontWeight: 600, color: COULEURS.discret, position: 'relative' }}>
          {sous}
        </div>
      )}
    </div>
  );
}

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('');
}

function ListeEnseignants({
  lignes,
  couleur,
  fond,
  vide,
  avecMinutes,
}: {
  lignes: LigneEnseignant[];
  couleur: string;
  fond: string;
  vide: string;
  avecMinutes?: boolean;
}) {
  if (lignes.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3mm',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '3mm',
          padding: '4mm',
          fontSize: '11px',
          fontWeight: 800,
          color: '#047857',
        }}
      >
        <ShieldCheck size={20} />
        {vide}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.2mm' }}>
      {lignes.map((l) => (
        <div
          key={l.enseignantId}
          style={{
            display: 'flex',
            gap: '3mm',
            alignItems: 'flex-start',
            background: fond,
            borderRadius: '3mm',
            padding: '2.4mm 3mm',
            breakInside: 'avoid',
            pageBreakInside: 'avoid',
          }}
        >
          <div
            style={{
              width: '8.5mm',
              height: '8.5mm',
              borderRadius: '50%',
              flexShrink: 0,
              background: `linear-gradient(135deg, ${couleur}, ${COULEURS.violet})`,
              color: '#fff',
              fontSize: '10px',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {initiales(l.nom)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '3mm',
              }}
            >
              <span style={{ fontSize: '11.5px', fontWeight: 900, color: '#111827' }}>{l.nom}</span>
              <span
                style={{
                  flexShrink: 0,
                  background: couleur,
                  color: '#fff',
                  fontSize: '9.5px',
                  fontWeight: 900,
                  borderRadius: '5mm',
                  padding: '0.6mm 3mm',
                }}
              >
                {l.nb} {avecMinutes ? (l.nb > 1 ? 'retards' : 'retard') : l.nb > 1 ? 'absences' : 'absence'}
                {avecMinutes ? ` · ${l.cumulMinutes} min` : ''}
              </span>
            </div>
            <div style={{ fontSize: '8.8px', fontWeight: 600, color: '#4b5563', marginTop: '0.8mm', lineHeight: 1.4 }}>
              {l.details.join('  •  ')}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RapportPeriodePdf({ rapport }: { rapport: RapportPeriode }) {
  const {
    serie,
    heuresProgrammees,
    heuresValidees,
    heuresPerduesRetard,
    heuresAbsence,
    heuresAVenir,
    nbCours,
    nbRetards,
    nbAbsences,
    nbAnnulees,
    tauxValidation,
  } = rapport;

  const labels = serie.map((p) => p.label);
  const pourcent = tauxValidation == null ? null : Math.round(tauxValidation * 100);

  const pic = serie.reduce(
    (m, p) => (p.programmees > m.programmees ? p : m),
    serie[0] ?? { label: '—', programmees: 0 }
  );
  const points: string[] = [];
  if (pourcent != null) {
    points.push(`${pourcent} % des heures déjà échues ont été validées.`);
  } else {
    points.push('Aucune séance échue sur la période pour le moment.');
  }
  if (pic && pic.programmees > 0) {
    points.push(`Pic de programmation : ${pic.label} (${formaterNombre(pic.programmees)} h).`);
  }
  points.push(
    nbRetards > 0
      ? `${nbRetards} retard${nbRetards > 1 ? 's' : ''} — ${formaterNombre(
          heuresPerduesRetard
        )} h perdue${heuresPerduesRetard > 1 ? 's' : ''} (retards, fermetures anticipées).`
      : 'Aucun retard enregistré.'
  );
  points.push(
    nbAbsences > 0
      ? `${nbAbsences} absence${nbAbsences > 1 ? 's' : ''} — ${formaterNombre(heuresAbsence)} h non assurée${
          heuresAbsence > 1 ? 's' : ''
        }.`
      : 'Aucune absence enregistrée.'
  );
  if (nbAnnulees > 0) {
    points.push(`${nbAnnulees} séance${nbAnnulees > 1 ? 's' : ''} annulée${nbAnnulees > 1 ? 's' : ''} (non comptées).`);
  }

  const enTeteHero = <EnteteHero titre={rapport.titre} periode={rapport.libellePeriode} />;
  const enTeteCompact = <EnteteCompact titre={rapport.titre} periode={rapport.libellePeriode} />;
  const pied = <PiedDePage genereLe={rapport.genereLe} />;

  const unite = rapport.type === 'semaine' ? 'jour' : 'semaine';

  return (
    <div className="rapport-pdf">
      {/* ── PAGE 1 ───────────────────────────────────────── */}
      <PageA4 enTete={enTeteHero} pied={pied}>
        <div style={{ display: 'flex', gap: '3mm' }}>
          <Kpi
            icone={<BookOpen size={17} />}
            valeur={String(nbCours)}
            label="Cours programmés"
            sous={nbAnnulees > 0 ? `+ ${nbAnnulees} annulé${nbAnnulees > 1 ? 's' : ''}` : undefined}
            c1={COULEURS.violet}
            c2={COULEURS.prune}
          />
          <Kpi
            icone={<CalendarClock size={17} />}
            valeur={`${formaterNombre(heuresProgrammees)} h`}
            label="Heures programmées"
            c1={COULEURS.bleu}
            c2={COULEURS.marine}
          />
          <Kpi
            icone={<CheckCircle2 size={17} />}
            valeur={`${formaterNombre(heuresValidees)} h`}
            label="Heures validées"
            sous={pourcent != null ? `${pourcent} % des heures échues` : undefined}
            c1={COULEURS.turquoise}
            c2={COULEURS.vert}
          />
          <Kpi
            icone={<Clock size={17} />}
            valeur={String(nbRetards)}
            label={nbRetards > 1 ? 'Retards' : 'Retard'}
            sous={`${formaterNombre(heuresPerduesRetard)} h perdues`}
            c1={COULEURS.orange}
            c2={COULEURS.or}
          />
          <Kpi
            icone={<UserX size={17} />}
            valeur={String(nbAbsences)}
            label={nbAbsences > 1 ? 'Absences' : 'Absence'}
            sous={`${formaterNombre(heuresAbsence)} h non assurées`}
            c1={COULEURS.rose}
            c2={COULEURS.prune}
          />
        </div>

        <Carte
          titre="Heures programmées et heures validées"
          sousTitre={`Évolution par ${unite} — ${rapport.libellePeriode.toLowerCase()}`}
          couleur={COULEURS.violet}
          style={{ marginTop: '5mm' }}
        >
          <CourbesLissees
            labels={labels}
            unite=" h"
            hauteur={290}
            series={[
              { nom: 'Heures programmées', couleur: COULEURS.violet, valeurs: serie.map((p) => p.programmees) },
              { nom: 'Heures validées', couleur: COULEURS.turquoise, valeurs: serie.map((p) => p.validees) },
            ]}
          />
        </Carte>

        <div style={{ display: 'flex', gap: '4mm', marginTop: '5mm' }}>
          <Carte
            titre="Taux de validation"
            sousTitre="Heures validées / heures des séances échues"
            couleur={COULEURS.turquoise}
            style={{ flex: 1 }}
          >
            <div
              style={{
                fontSize: '36px',
                fontWeight: 900,
                color: COULEURS.turquoise,
                lineHeight: 1,
                margin: '1mm 0 3mm',
              }}
            >
              {pourcent != null ? `${pourcent} %` : '—'}
            </div>
            <div style={{ height: '4mm', borderRadius: '2mm', background: '#e6f6f5', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${pourcent ?? 0}%`,
                  borderRadius: '2mm',
                  background: `linear-gradient(90deg, ${COULEURS.turquoise}, ${COULEURS.vert})`,
                }}
              />
            </div>
          </Carte>

          <Carte titre="Points marquants" couleur={COULEURS.or} style={{ flex: 1.45 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8mm', marginTop: '1.5mm' }}>
              {points.map((p, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: '2mm',
                    fontSize: '9.8px',
                    fontWeight: 600,
                    color: '#374151',
                    lineHeight: 1.35,
                  }}
                >
                  <Sparkles size={12} style={{ flexShrink: 0, marginTop: 1 }} color={COULEURS.or} />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </Carte>
        </div>
      </PageA4>

      {/* ── PAGE 2 ───────────────────────────────────────── */}
      <PageA4 enTete={enTeteCompact} pied={pied}>
        <Carte
          titre="Retards et absences"
          sousTitre={`Nombre de séances concernées, par ${unite}`}
          couleur={COULEURS.orange}
        >
          <CourbesLissees
            labels={labels}
            hauteur={250}
            series={[
              { nom: 'Retards', couleur: COULEURS.orange, valeurs: serie.map((p) => p.retards) },
              { nom: 'Absences', couleur: COULEURS.rose, valeurs: serie.map((p) => p.absences) },
            ]}
          />
        </Carte>

        <div style={{ display: 'flex', gap: '4mm', marginTop: '5mm' }}>
          <Carte titre="Répartition des heures programmées" couleur={COULEURS.marine} style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4mm', marginTop: '2mm' }}>
              <Donut
                taille={150}
                centre={pourcent != null ? `${pourcent}%` : '—'}
                sousCentre="validé"
                parts={[
                  { label: 'Validées', valeur: heuresValidees, couleur: COULEURS.turquoise },
                  { label: 'Perdues', valeur: heuresPerduesRetard, couleur: COULEURS.orange },
                  { label: 'Absences', valeur: heuresAbsence, couleur: COULEURS.rose },
                  { label: 'À venir', valeur: heuresAVenir, couleur: '#c7c9e6' },
                ]}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2.2mm', flex: 1 }}>
                {[
                  ['Validées', heuresValidees, COULEURS.turquoise],
                  ['Perdues (retards)', heuresPerduesRetard, COULEURS.orange],
                  ['Absences', heuresAbsence, COULEURS.rose],
                  ['À venir / en cours', heuresAVenir, '#9a9dd0'],
                ].map(([nom, valeur, couleur]) => (
                  <div
                    key={nom as string}
                    style={{ display: 'flex', alignItems: 'center', gap: '2mm', fontSize: '9.8px', fontWeight: 700 }}
                  >
                    <span
                      style={{
                        width: '3mm',
                        height: '3mm',
                        borderRadius: '1mm',
                        background: couleur as string,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, color: '#374151' }}>{nom as string}</span>
                    <span style={{ color: couleur as string, fontWeight: 900 }}>
                      {formaterNombre(valeur as number)} h
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Carte>
        </div>

        <Carte titre={`Synthèse par ${unite}`} couleur={COULEURS.violet} style={{ marginTop: '5mm' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '10px' }}>
            <thead>
              <tr>
                {[
                  [rapport.type === 'semaine' ? 'Jour' : 'Semaine', 'left'],
                  ['Heures prog.', 'right'],
                  ['Heures valid.', 'right'],
                  ['Retards', 'right'],
                  ['Absences', 'right'],
                ].map(([titre, align], i, tab) => (
                  <th
                    key={titre}
                    style={{
                      textAlign: align as 'left' | 'right',
                      background: `linear-gradient(90deg, ${COULEURS.marine}, ${COULEURS.violet})`,
                      color: '#fff',
                      fontWeight: 800,
                      padding: '1.8mm 3mm',
                      borderTopLeftRadius: i === 0 ? '2.4mm' : 0,
                      borderTopRightRadius: i === tab.length - 1 ? '2.4mm' : 0,
                    }}
                  >
                    {titre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {serie.map((p, i) => (
                <tr key={p.cle} style={{ background: i % 2 === 0 ? '#f7f6ff' : '#ffffff' }}>
                  <td style={{ padding: '1.7mm 3mm', fontWeight: 800 }}>{p.label}</td>
                  <td style={{ padding: '1.7mm 3mm', textAlign: 'right', fontWeight: 700, color: COULEURS.violet }}>
                    {formaterNombre(p.programmees)} h
                  </td>
                  <td style={{ padding: '1.7mm 3mm', textAlign: 'right', fontWeight: 700, color: COULEURS.turquoise }}>
                    {formaterNombre(p.validees)} h
                  </td>
                  <td style={{ padding: '1.7mm 3mm', textAlign: 'right', fontWeight: 700, color: COULEURS.orange }}>
                    {p.retards}
                  </td>
                  <td style={{ padding: '1.7mm 3mm', textAlign: 'right', fontWeight: 700, color: COULEURS.rose }}>
                    {p.absences}
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#ece9ff', fontWeight: 900 }}>
                <td style={{ padding: '2mm 3mm', borderBottomLeftRadius: '2.4mm' }}>Total</td>
                <td style={{ padding: '2mm 3mm', textAlign: 'right', color: COULEURS.violet }}>
                  {formaterNombre(heuresProgrammees)} h
                </td>
                <td style={{ padding: '2mm 3mm', textAlign: 'right', color: COULEURS.turquoise }}>
                  {formaterNombre(heuresValidees)} h
                </td>
                <td style={{ padding: '2mm 3mm', textAlign: 'right', color: COULEURS.orange }}>{nbRetards}</td>
                <td
                  style={{
                    padding: '2mm 3mm',
                    textAlign: 'right',
                    color: COULEURS.rose,
                    borderBottomRightRadius: '2.4mm',
                  }}
                >
                  {nbAbsences}
                </td>
              </tr>
            </tbody>
          </table>
        </Carte>
      </PageA4>

      {/* ── PAGE 3 : enseignants absents ─────────────────── */}
      <PageA4 enTete={enTeteCompact} pied={pied}>
        <Carte
          titre={`Enseignants absents (${rapport.absents.length})`}
          sousTitre="Séances programmées, créneau terminé, jamais ouvertes ni annulées"
          couleur={COULEURS.rose}
        >
          <ListeEnseignants
            lignes={rapport.absents}
            couleur={COULEURS.rose}
            fond="#fff1f4"
            vide="Aucune absence d'enseignant sur la période."
          />
        </Carte>
      </PageA4>

      {/* ── PAGE 4 : enseignants en retard ───────────────── */}
      <PageA4 enTete={enTeteCompact} pied={pied} derniere>
        <Carte
          titre={`Enseignants en retard (${rapport.retardataires.length})`}
          sousTitre="Ouverture de séance au-delà de la marge de 15 minutes"
          couleur={COULEURS.orange}
        >
          <ListeEnseignants
            lignes={rapport.retardataires}
            couleur={COULEURS.orange}
            fond="#fff6ec"
            vide="Aucun retard d'enseignant sur la période."
            avecMinutes
          />
        </Carte>
      </PageA4>
    </div>
  );
}