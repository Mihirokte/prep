import VizPlayer from './VizPlayer'
import { SCENES } from './index'

/** ```viz blocks: the fence body is a scene id. */
export default function VizEmbed({ id }: { id: string }) {
  const scene = SCENES[id.trim()]
  if (!scene) return <pre className="diagram my-8 p-4">{`viz: unknown scene "${id.trim()}"`}</pre>
  return <VizPlayer key={scene.id} scene={scene} />
}
