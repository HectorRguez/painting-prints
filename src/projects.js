import flowers from './generators/flowers/project.js';
import landscapes from './generators/landscapes/project.js';
import fish from './generators/fish/project.js';
import maps from './generators/maps/project.js';

export const projects = { flowers, landscapes, fish, maps };
export const pageModes = Object.keys(projects);

export function publicationDate(project) {
  return project.published.slice(0, 4);
}
