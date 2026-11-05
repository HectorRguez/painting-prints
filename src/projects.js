import flowers from './generators/flowers/project.js';
import landscapes from './generators/landscapes/project.js';
import leaves from './generators/leaves/project.js';
import snowflakes from './generators/snowflakes/project.js';
import seascapes from './generators/seascapes/project.js';
import ribbons from './generators/ribbons/project.js';
import dunes from './generators/dunes/project.js';
import brushwork from './generators/brushwork/project.js';

export const projects = { flowers, landscapes, leaves, snowflakes, seascapes, ribbons, dunes, brushwork };
export const pageModes = Object.keys(projects);

export function publicationDate(project) {
  return project.published.slice(0, 4);
}
