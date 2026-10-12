export const projects = {
  flowers: { published: '2018-02-12', label: 'Flowers', title: 'Nonflowers', author: 'Lingdong Huang', source: 'https://github.com/LingDong-/nonflowers', ratio: 1, orientation: 'portrait' },
  landscapes: { published: '2018-01-30', label: 'Landscapes', title: 'Shan Shui', author: 'Lingdong Huang', source: 'https://github.com/LingDong-/shan-shui-inf', ratio: Math.SQRT2, orientation: 'landscape' },
  fish: { published: '2021-08-11', label: 'Fish', title: 'Fishdraw', author: 'Lingdong Huang', source: 'https://github.com/LingDong-/fishdraw', ratio: 520 / 320, orientation: 'landscape' },
  maps: { published: '2018-07-20', label: 'Maps', title: 'Mapgen4 · 3D line art', author: 'Amit Patel', source: 'https://github.com/redblobgames/mapgen4', ratio: 1, orientation: 'portrait' },
};
export const pageModes = Object.keys(projects);

export function publicationDate(project) {
  return project.published.slice(0, 4);
}
