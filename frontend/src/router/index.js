import { createRouter, createWebHashHistory } from 'vue-router'

/*
 * Using hash history so ChatOut works inside iframes without
 * requiring the host to configure URL rewrites.
 */

const routes = [
  {
    path: '/',
    name: 'checkout',
    /* Lazy-loaded for code splitting */
    component: () => import('../views/CheckoutView.vue'),
  },
  {
    path: '/confirmation/:reference',
    name: 'confirmation',
    component: () => import('../views/OrderConfirmation.vue'),
  },
  {
    path: '/s/:slug',
    name: 'storefront',
    component: () => import('../views/CheckoutView.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
