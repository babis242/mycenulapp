// src/features/referentiel/jumelages/pages/ListeJumelagesPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import { listJumelages, deleteJumelage, type JumelageAvecUEs } from '../api';

// Un Jumelage regroupe plusieurs UEs distinctes (chacune restant rattachée à
// sa propre spécialité) — c'est le remplaçant du "tronc commun" défini à la
// création, désormais géré a posteriori (cf. discussion produit).
export default function ListeJumelagesPage() {
  const navigate = useNavigate();
  const [jumelages, setJumelages] = useState<JumelageAvecUEs[]>([]);
  const [loading, setLoading] = useState(true);

  function reload() {
    setLoading(true);
    listJumelages()
      .then(setJumelages)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleDelete(id: string) {
    if (
      !window.confirm(
        'Supprimer ce jumelage ? Les UEs elles-mêmes ne seront pas supprimées.'
      )
    )
      return;
    await deleteJumelage(id);
    reload();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">Jumelages</p>
          <p className="text-sm text-gray-400 mt-0.5">
            Regroupe plusieurs UEs distinctes pour un enseignement commun (tronc
            commun).
          </p>
        </div>
        <button
          onClick={() => navigate('/referentiel/jumelages/nouveau')}
          className="flex items-center gap-2 bg-red-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
        >
          <Plus size={16} /> Créer un jumelage
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : jumelages.length === 0 ? (
        <div className="bg-white rounded-[20px] p-10 text-center">
          <p className="font-bold text-gray-900 mb-1">
            Aucun jumelage pour l'instant
          </p>
          <p className="text-sm text-gray-400">
            Regroupe des UEs existantes qui doivent être enseignées ensemble.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {jumelages.map((j) => (
            <div key={j.id} className="bg-white rounded-[20px] p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-base text-gray-900">{j.nom}</p>
                  <p className="text-xs text-gray-400">
                    {j.enseignant_nom
                      ? `Enseignant : ${j.enseignant_nom}`
                      : 'Aucun enseignant assigné'}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(j.id)}
                  className="text-gray-300 hover:text-red-600 p-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {j.ues.map((ue) => (
                  <span
                    key={ue.id}
                    className="text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-full"
                  >
                    {ue.nom}{' '}
                    {ue.specialite_nom && (
                      <span className="text-gray-400 font-semibold">
                        · {ue.specialite_nom}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
