import type { Sprite } from './types.js';
import { abel }        from './abel.js';
import { alpaca }      from './alpaca.js';
import { axolotl }     from './axolotl.js';
import { badger }      from './badger.js';
import { bear }        from './bear.js';
import { beaver }      from './beaver.js';
import { bee }         from './bee.js';
import { bird }        from './bird.js';
import { bumblebee }   from './bumblebee.js';
import { bunny }       from './bunny.js';
import { cat }         from './cat.js';
import { chipmunk }    from './chipmunk.js';
import { crab }        from './crab.js';
import { crane }       from './crane.js';
import { deer }        from './deer.js';
import { dolphin }     from './dolphin.js';
import { dove }        from './dove.js';
import { dragon }      from './dragon.js';
import { dragonfly }   from './dragonfly.js';
import { duckling }    from './duckling.js';
import { eagle }       from './eagle.js';
import { elephant }    from './elephant.js';
import { falcon }      from './falcon.js';
import { finch }       from './finch.js';
import { flamingo }    from './flamingo.js';
import { fox }         from './fox.js';
import { frog }        from './frog.js';
import { giraffe }     from './giraffe.js';
import { goose }       from './goose.js';
import { hamster }     from './hamster.js';
import { hare }        from './hare.js';
import { hedgehog }    from './hedgehog.js';
import { hippo }       from './hippo.js';
import { hummingbird } from './hummingbird.js';
import { jellyfish }   from './jellyfish.js';
import { koala }       from './koala.js';
import { ladybug }     from './ladybug.js';
import { lark }        from './lark.js';
import { lemur }       from './lemur.js';
import { llama }       from './llama.js';
import { lobster }     from './lobster.js';
import { lynx }        from './lynx.js';
import { manatee }     from './manatee.js';
import { meerkat }     from './meerkat.js';
import { moth }        from './moth.js';
import { narwhal }     from './narwhal.js';
import { newt }        from './newt.js';
import { octopus }     from './octopus.js';
import { otter }       from './otter.js';
import { owl }         from './owl.js';
import { panda }       from './panda.js';
import { parrot }      from './parrot.js';
import { peacock }     from './peacock.js';
import { pelican }     from './pelican.js';
import { penguin }     from './penguin.js';
import { phoenix }     from './phoenix.js';
import { piglet }      from './piglet.js';
import { platypus }    from './platypus.js';
import { pony }        from './pony.js';
import { porcupine }   from './porcupine.js';
import { puffin }      from './puffin.js';
import { puppy }       from './puppy.js';
import { raccoon }     from './raccoon.js';
import { raven }       from './raven.js';
import { robin }       from './robin.js';
import { robot }       from './robot.js';
import { salamander }  from './salamander.js';
import { seahorse }    from './seahorse.js';
import { sloth }       from './sloth.js';
import { snail }       from './snail.js';
import { sparrow }     from './sparrow.js';
import { squirrel }    from './squirrel.js';
import { swan }        from './swan.js';
import { toucan }      from './toucan.js';
import { turtle }      from './turtle.js';
import { unicorn }     from './unicorn.js';
import { viper }       from './viper.js';
import { walrus }      from './walrus.js';
import { weasel }      from './weasel.js';
import { wolf }        from './wolf.js';
import { wolverine }   from './wolverine.js';
import { wren }        from './wren.js';
import { fallback }    from './fallback.js';

export type { Sprite };

const REGISTRY: Record<string, Sprite> = {
  abel,
  alpaca,
  axolotl,
  badger,
  bear,
  beaver,
  bee,
  bird,
  bumblebee,
  bunny,
  rabbit: bunny,
  cat,
  kitten: cat,
  chipmunk,
  crab,
  crane,
  deer,
  dolphin,
  dove,
  dragon,
  dragonfly,
  duckling,
  eagle,
  elephant,
  falcon,
  finch,
  flamingo,
  fox,
  frog,
  giraffe,
  goose,
  hamster,
  hare,
  hedgehog,
  hippo,
  hummingbird,
  jellyfish,
  koala,
  ladybug,
  lark,
  lemur,
  llama,
  lobster,
  lynx,
  manatee,
  meerkat,
  moth,
  narwhal,
  newt,
  octopus,
  otter,
  owl,
  panda,
  parrot,
  peacock,
  pelican,
  penguin,
  phoenix,
  piglet,
  platypus,
  pony,
  porcupine,
  puffin,
  puppy,
  raccoon,
  raven,
  robin,
  robot,
  salamander,
  seahorse,
  sloth,
  snail,
  sparrow,
  squirrel,
  swan,
  toucan,
  turtle,
  unicorn,
  viper,
  walrus,
  weasel,
  wolf,
  wolverine,
  wren,
};

/** All animal names that map to custom sprites */
export const SUPPORTED_ANIMALS = Object.keys(REGISTRY);

/** Get all sprites (for web UI / export) */
export function getAllSprites(): Record<string, Sprite> {
  return { ...REGISTRY, claude: fallback };
}

/** Get the sprite for the given animal name, falling back to the Claude mascot */
export function getSprite(animal: string): Sprite {
  return REGISTRY[animal.toLowerCase()] ?? fallback;
}

/**
 * Given a session UUID, deterministically pick an animal using the same
 * wordlist Claude Code uses so results feel consistent per session.
 */
export function animalFromSessionId(sessionId: string): string {
  const ANIMALS = Object.keys(REGISTRY).filter(k => k !== 'rabbit' && k !== 'kitten');
  let hash = 5381;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 33) ^ sessionId.charCodeAt(i);
    hash = hash >>> 0;
  }
  return ANIMALS[hash % ANIMALS.length];
}
