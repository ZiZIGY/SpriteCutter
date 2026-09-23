import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'cutter',
    component: () => import('@/views/CutterView.vue'),
  },
  // Unknown paths (including the old /rig) fall back to the cutter rather
  // than a blank screen.
  { path: '/:pathMatch(.*)*', redirect: { name: 'cutter' } },
];

const router = createRouter({
  // BASE_URL comes from vite's `base`, so this works both locally and under
  // the /SpriteCutter/ path on GitHub Pages.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
