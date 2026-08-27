/**
 * Bundled OpenSCAD sources for the Altoids pick insert.
 *
 * Vite `?raw` imports fold the .scad files into the JS bundle so the
 * worker can write them into its virtual filesystem without a network
 * fetch. Files under `public/` cannot be imported this way, which is
 * why they live here under `src/model/`.
 */
import main from './altoids_pick_insert.scad?raw'
import profiles from './pick_profiles.scad?raw'

export const MODEL_MAIN = main
export const MODEL_INCLUDES: Record<string, string> = {
  'pick_profiles.scad': profiles,
}
