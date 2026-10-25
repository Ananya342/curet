import { PETS, PET_IDS, PetId } from "../pets";
import { setPetId } from "../api";
import Wardrobe from "./Wardrobe";

export default function Pets({ petId }: { petId: PetId }) {
  return (
    <div className="scroll settings">
      <section aria-labelledby="h-pet">
        <h2 id="h-pet">Your pet</h2>
        <div className="pets" role="radiogroup" aria-label="Choose your pet">
          {PET_IDS.map((id) => {
            const def = PETS[id];
            return (
              <button key={id} role="radio" aria-checked={id === petId} className="pet-pick" onClick={() => setPetId(id)}>
                {/* Plain, so you pick the animal itself; dressing up happens below. */}
                <span className="pick-sprite" aria-hidden="true"><img src={def.src} alt="" draggable={false} /></span>
                <span translate="no">{def.name}</span>
              </button>
            );
          })}
        </div>
      </section>
      <Wardrobe petId={petId} />
    </div>
  );
}
