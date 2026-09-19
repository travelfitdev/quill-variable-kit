// 示例直接从源码引入，样式要像消费者那样显式引入一次：
// src/index.ts 里对 CSS 的副作用式 import 在「从源码打包」时不会进入产物。
import 'quill/dist/quill.core.css';
import '../src/style.css';

import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
