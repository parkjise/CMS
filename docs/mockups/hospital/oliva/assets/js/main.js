/**
 * Oliva Casa — Main Script
 */
document.addEventListener('includes:loaded', () => {
  initNavLinks();
  initActionButtons();
  initReservationFields();
  initMobileDrawer();
});

function initNavLinks() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
}

function initActionButtons() {
  // Action buttons click handling
  document.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    if (action === 'check-reservation') {
      alert('선택하신 시간의 예약 가능 여부를 확인했습니다. 전화 예약: 02-332-0418');
    } else if (action === 'map') {
      window.open(
        'https://map.naver.com/p/search/서울%20서대문구%20연희로11길%2018',
        '_blank',
        'noopener,noreferrer',
      );
    } else if (action === 'scroll') {
      const target = actionBtn.dataset.target;
      if (target) {
        const el = document.querySelector(target);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
}

function initReservationFields() {
  // Mock interactive dropdowns for reservation fields
  const fields = document.querySelectorAll('.oliva-reservation__field-select');
  fields.forEach((field) => {
    field.addEventListener('click', () => {
      // Small visual feedback
      field.classList.toggle('is-active');
    });
  });
}

function initMobileDrawer() {
  const toggle = document.getElementById('mobileMenuToggle');
  const drawer = document.getElementById('mobileDrawer');
  const backdrop = document.getElementById('mobileDrawerBackdrop');
  const closeBtn = document.getElementById('mobileDrawerClose');

  if (!toggle || !drawer || !backdrop) return;

  const openDrawer = () => {
    drawer.classList.add('is-open');
    backdrop.classList.add('is-visible');
    toggle.classList.add('is-active');
    toggle.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
  };

  const closeDrawer = () => {
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-visible');
    toggle.classList.remove('is-active');
    toggle.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
  };

  toggle.addEventListener('click', () => {
    const isOpen = drawer.classList.contains('is-open');
    if (isOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', closeDrawer);
  }

  backdrop.addEventListener('click', closeDrawer);

  // Close drawer when clicking any link inside the drawer
  drawer.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      closeDrawer();
    });
  });

  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });
}
