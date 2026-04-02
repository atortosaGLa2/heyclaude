import type { Sprite } from './types.js';
import { crab }     from './crab.js';
import { octopus }  from './octopus.js';
import { bunny }    from './bunny.js';
import { cat }      from './cat.js';
import { owl }      from './owl.js';
import { fox }      from './fox.js';
import { penguin }  from './penguin.js';
import { dragon }   from './dragon.js';
import { robot }    from './robot.js';
import { panda }    from './panda.js';
import { turtle }   from './turtle.js';
import { hedgehog } from './hedgehog.js';
import { koala }    from './koala.js';
import { sloth }    from './sloth.js';
import { hamster }   from './hamster.js';
import { jellyfish } from './jellyfish.js';
import { dolphin }  from './dolphin.js';
import { wolf }     from './wolf.js';
import { fallback }  from './fallback.js';

export type { Sprite };

const REGISTRY: Record<string, Sprite> = {
  crab,
  octopus,
  bunny,
  rabbit: bunny,
  cat,
  kitten: cat,
  owl,
  fox,
  penguin,
  dragon,
  robot,
  panda,
  turtle,
  hedgehog,
  koala,
  sloth,
  hamster,
  jellyfish,
  dolphin,
  wolf,
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
  const ANIMALS = [
    'alpaca','axolotl','badger','bear','beaver','bee','bird','bumblebee',
    'bunny','cat','chipmunk','crab','crane','deer','dolphin','dove','dragon',
    'dragonfly','duckling','eagle','elephant','falcon','finch','flamingo',
    'fox','frog','giraffe','goose','hamster','hare','hedgehog','hippo',
    'hummingbird','jellyfish','kitten','koala','ladybug','lark','lemur',
    'llama','lobster','lynx','manatee','meerkat','moth','narwhal','newt',
    'octopus','otter','owl','panda','parrot','peacock','pelican','penguin',
    'phoenix','piglet','platypus','pony','porcupine','puffin','puppy',
    'quail','quokka','rabbit','raccoon','raven','robin','salamander',
    'seahorse','sloth','snail','sparrow','squirrel','swan','toucan',
    'turtle','unicorn','viper','walrus','weasel','wolf','wolverine','wren',
  ];
  // Simple djb2-style hash of the UUID string
  let hash = 5381;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 33) ^ sessionId.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return ANIMALS[hash % ANIMALS.length];
}
