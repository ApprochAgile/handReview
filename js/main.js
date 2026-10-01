import { mountEditor } from './editor.js';
import { mountHost } from './host.js';
import { mountVoter } from './voter.js';

const root = document.getElementById('app');
const ROUTES = { editor: mountEditor, host: mountHost, voter: mountVoter };
let cleanup = null;

function show(name, arg) {
  const mount = ROUTES[name];
  if (!mount) {
    root.innerHTML = '<section class="panel"><p>Écran pas encore disponible.</p></section>';
    return;
  }
  cleanup = mount(root, arg) ?? null;
}

function renderHome() {
  root.innerHTML = `
    <section class="home">
      <a class="home-card" href="#edit">
        <h2>Créer une main</h2>
        <p>Saisis une main et ses points de vote, puis exporte-la en JSON.</p>
      </a>
      <a class="home-card" href="#host">
        <h2>Héberger une session</h2>
        <p>Importe une main, partage le lien et pilote le vote.</p>
      </a>
      <div class="home-card">
        <h2>Rejoindre</h2>
        <p>Ouvre le lien envoyé par l'hôte, ou colle-le ici.</p>
        <form data-join>
          <input type="text" name="link" placeholder="Lien de la session" aria-label="Lien de la session">
          <button class="btn primary">Rejoindre</button>
        </form>
      </div>
    </section>`;
  root.querySelector('[data-join]').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = String(new FormData(e.target).get('link') ?? '').trim();
    const id = value.match(/#join=(.+)$/)?.[1] ?? value;
    if (id) location.hash = `#join=${id}`;
  });
}

function route() {
  cleanup?.();
  cleanup = null;
  const hash = location.hash;
  if (hash.startsWith('#join=')) {
    let id;
    try {
      id = decodeURIComponent(hash.slice('#join='.length));
    } catch {
      return renderHome();
    }
    return show('voter', id);
  }
  if (hash === '#edit') return show('editor');
  if (hash === '#host') return show('host');
  renderHome();
}

window.addEventListener('hashchange', route);
route();
