import cityscapes from './generators/cityscapes/project.js';
import buildings from './generators/buildings/project.js';
import flowers from './generators/flowers/project.js';
import landscapes from './generators/landscapes/project.js';

import ribbons from './generators/ribbons/project.js';

export const projects = { flowers, landscapes, cityscapes, buildings, ribbons };
export const pageModes = Object.keys(projects);

export function publicationDate(project) {
  return project.published.slice(0, 4);
}
