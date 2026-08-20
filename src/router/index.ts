import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router';

import { useSpriteStore } from '@/stores/spriteStore';

/**
 * Route meta drives the shell: each page declares which sidebar it wants, so
 * App.vue stays free of per-page branching.
 */
declare module 'vue-router' {
  interface RouteMeta {
    /** Sidebar component key, or null for a page with no drawer. */
    sidebar: 'cutter' | 'rig' | null;
    title: string;
    /** Page needs a loaded image; guarded back to the upload screen. */
    requiresImage?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'cutter',
    component: () => import('@/views/CutterView.vue'),
    meta: { sidebar: 'cutter', title: 'Нарезка' },
  },
  {
    path: '/rig',
    name: 'rig',
    component: () => import('@/views/RigView.vue'),
    meta: { sidebar: 'rig', title: '2D Rigging', requiresImage: true },
  },
  // Unknown paths fall back to the cutter rather than a blank screen.
  { path: '/:pathMatch(.*)*', redirect: { name: 'cutter' } },
];

const router = createRouter({
  // BASE_URL comes from vite's `base`, so this works both locally and under
  // the /SpriteCutter/ path on GitHub Pages.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Deep-linking to /rig without an image would show an empty editor, so send
// the user to the upload screen instead. The guard body runs after the app has
// installed pinia, so resolving the store here is safe.
router.beforeEach((to) => {
  if (!to.meta.requiresImage) return true;
  return useSpriteStore().imageSrc ? true : { name: 'cutter' };
});

export default router;
