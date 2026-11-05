import flowers from './generators/flowers/project.js';
import landscapes from './generators/landscapes/project.js';
import cityscapes from './generators/cityscapes/project.js';
import buildings from './generators/buildings/project.js';
import leaves from './generators/leaves/project.js';
import snowflakes from './generators/snowflakes/project.js';
import seascapes from './generators/seascapes/project.js';
import ribbons from './generators/ribbons/project.js';
import interference from './generators/interference/project.js';
import dunes from './generators/dunes/project.js';
import brushwork from './generators/brushwork/project.js';
import folds from './generators/folds/project.js';

export const projects = { flowers, landscapes, cityscapes, buildings, leaves, snowflakes, seascapes, ribbons, interference, dunes, brushwork, folds };
export const pageModes = Object.keys(projects);

export function publicationDate(project) {
  return project.published.slice(0, 4);
}
