import { useEffect, useState } from "react";
import { PETS, PET_IDS, PetId } from "../pets";
import { setPetId } from "../api";
import { DEFAULT_OUTFIT, Outfit, getOutfit } from "../accessories";
import Wardrobe, { Dressed } from "./Wardrobe";

export default function Pets({ petId }: { petId: PetId }) {
  const [outfit, setOutfit] = useState<Outfit>(DEFAULT_OUTFIT);
  useEffect(() => { getOutfit().then(setOutfit); }, []);
  return (
    <div className="scroll settings">
      <section aria-labelledby="h-pet">
        <h2 id="h-pet">Your pet</h2>
        <div className="pets" role="radiogroup" aria-label="Choose your pet">
          {PET_IDS.map((id) => {
            const def = PETS[id];
            return (
              <button key={id} role="radio" aria-checked={id === petId} className="pet-pick" onClick={() => setPetId(id)}>
                <span className="pick-sprite" aria-hidden="true"><Dressed view={def} w={46} outfit={outfit} /></span>
                <span translate="no">{def.name}</span>
              </button>
            );
          })}
        </div>
      </section>
      <Wardrobe petId={petId} onOutfit={setOutfit} />
    </div>
  );
}
