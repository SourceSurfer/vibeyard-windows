import { closeModal } from './modal.js';
import { appState } from '../state.js';

const STAR_THRESHOLD = 10;
const REPO_URL = 'https://github.com/elirantutia/vibeyard';

function showStarPromptDialog(): void {
  const overlay = document.getElementById('modal-overlay')!;
  const modal = document.getElementById('modal')!;
  const titleEl = document.getElementById('modal-title')!;
  const bodyEl = document.getElementById('modal-body')!;
  const btnCancel = document.getElementById('modal-cancel')!;
  const btnConfirm = document.getElementById('modal-confirm')!;

  titleEl.textContent = 'Enjoying Vibeyard?';
  bodyEl.innerHTML = '';
  modal.classList.remove('modal-wide');
  btnCancel.style.display = 'none';
  btnConfirm.style.display = 'none';

  const container = document.createElement('div');
  container.className = 'star-prompt-container';

  const icon = document.createElement('div');
  icon.className = 'star-prompt-icon';
  icon.textContent = '\u2B50';
  container.appendChild(icon);

  const message = document.createElement('div');
  message.className = 'star-prompt-message';
  message.textContent =
    "If Vibeyard has been useful to you, consider giving it a star on GitHub. It helps others discover the project!";
  container.appendChild(message);

  const actions = document.createElement('div');
  actions.className = 'star-prompt-actions';

  const starBtn = document.createElement('button');
  starBtn.className = 'modal-btn primary';
  starBtn.textContent = 'Star on GitHub';
  actions.appendChild(starBtn);

  const laterBtn = document.createElement('button');
  laterBtn.className = 'modal-btn';
  laterBtn.textContent = 'Maybe Later';
  actions.appendChild(laterBtn);

  container.appendChild(actions);

  const dontAsk = document.createElement('button');
  dontAsk.className = 'star-prompt-dont-ask';
  dontAsk.textContent = "Don't ask again";
  container.appendChild(dontAsk);

  bodyEl.appendChild(container);

  overlay.classList.remove('hidden');

  if ((overlay as any)._cleanup) {
    (overlay as any)._cleanup();
    (overlay as any)._cleanup = null;
  }

  const close = () => {
    closeModal();
    btnCancel.style.display = '';
    btnConfirm.style.display = '';
  };

  const handleStar = () => {
    window.vibeyard.app.openExternal(REPO_URL);
    appState.dismissStarPrompt();
    close();
  };

  const handleDontAsk = () => {
    appState.dismissStarPrompt();
    close();
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  starBtn.addEventListener('click', handleStar);
  laterBtn.addEventListener('click', close);
  dontAsk.addEventListener('click', handleDontAsk);
  document.addEventListener('keydown', handleKeydown);

  (overlay as any)._cleanup = () => {
    starBtn.removeEventListener('click', handleStar);
    laterBtn.removeEventListener('click', close);
    dontAsk.removeEventListener('click', handleDontAsk);
    document.removeEventListener('keydown', handleKeydown);
  };
}

export function checkStarPrompt(): void {
  if (appState.starPromptDismissed) return;
  if (appState.appLaunchCount < STAR_THRESHOLD) return;
  showStarPromptDialog();
}
