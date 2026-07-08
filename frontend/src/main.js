/*
 * ChatOut — Conversational Checkout System
 * A standalone, embeddable AI-powered checkout for Nomba
 * Vue 3 + Vite + Pinia + Vanilla CSS
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router/index.js'
import App from './App.vue'

/* Global CSS — loaded in cascade order.
   Self-hosted Space Grotesk (variable) is loaded via typography.css
   which uses @font-face pointing to /public/fonts/SpaceGrotesk-Variable.ttf. */
import './assets/css/typography.css'
import './assets/css/variables.css'
import './assets/css/base.css'
import './assets/css/layout.css'
import './assets/css/checkout.css'
import './assets/css/chat.css'
import './assets/css/product-detail.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
