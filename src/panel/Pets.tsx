import { PETS, PET_IDS, PetId } from "../pets";
import { setPetId } from "../api";

export default function Pets({ petId }: { petId: PetId }) {
  return (
    <div className="scroll settings">
      <section aria-labelledby="h-pet">
        <h2 id="h-pet">Your pet</h2>
        <div className="pets" role="radiogroup" aria-label="Choose your pet">
          {PET_IDS.map((id) => (
            <button key={id} role="radio" aria-checked={id === petId} className="pet-pick" onClick={() => setPetId(id)}>
              <img src={PETS[id].src} alt="" draggable={false} />
              <span translate="no">{PETS[id].name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
