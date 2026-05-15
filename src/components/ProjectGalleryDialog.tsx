import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { ModelContext } from './contexts.ts';
import { loadProjects, type BrowserProject } from '../state/projects-loader.ts';
import './ProjectGalleryDialog.css';

type ViewMode = 'grid' | 'kanban';

// Defers the image network request until the card scrolls near the
// viewport. Belt-and-braces on top of loading="lazy" — Safari < 16.4 and
// some embedded webviews ignore the native hint.
function LazyThumbnail({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
          return;
        }
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <img
      ref={ref}
      src={visible ? src : undefined}
      alt={alt}
      loading="lazy"
      decoding="async"
    />
  );
}

export function ProjectGalleryDialog({
  visible,
  onHide,
  onOpenProject,
  variant = 'dialog',
  mode = 'embedded',
}: {
  visible: boolean;
  onHide: () => void;
  onOpenProject?: (projectId: string) => void;
  variant?: 'dialog' | 'fullscreen';
  mode?: 'embedded' | 'standalone';
}) {
  const model = useContext(ModelContext);

  // Check if Kanban view is enabled via environment variable
  const envKanban = (typeof process !== 'undefined' && process.env?.PLAYGROUND_KANBAN_ENABLED ? process.env.PLAYGROUND_KANBAN_ENABLED : '').toLowerCase();
  const kanbanEnabled = envKanban === 'true' || envKanban === '1' || envKanban === 'yes';

  const [projects, setProjects] = useState<BrowserProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // Apply theme to document
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadProjects().then((scanned) => {
      if (!cancelled) {
        setProjects(scanned);
        if (scanned.length === 0) {
          setError('No projects found. Check that Models directory is available.');
        }
        setLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) {
        console.error('Failed to load projects:', err);
        setError(err instanceof Error ? err.message : String(err));
        setProjects([]);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setSearchTerm('');
      setSelectedCategory(null);
    }
  }, [visible]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    projects.forEach(project => {
      if (project.category) set.add(project.category);
    });
    return Array.from(set).sort();
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return projects.filter(project => {
      const matchesCategory = !selectedCategory || project.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!term) return true;
      const haystack = [
        project.title,
        project.description ?? '',
        project.author ?? '',
        project.category ?? '',
        ...(project.tags ?? []),
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [projects, searchTerm, selectedCategory]);

  const kanbanColumns = useMemo(() => {
    const columns = {
      unlabeled: { title: 'Unlabeled', color: '#94a3b8', projects: [] as BrowserProject[] },
      ideas: { title: 'Ideas', color: '#ef4444', projects: [] as BrowserProject[] },
      'in-progress': { title: 'In Progress', color: '#f59e0b', projects: [] as BrowserProject[] },
      'in-review': { title: 'In Review', color: '#3b82f6', projects: [] as BrowserProject[] },
      completed: { title: 'Completed', color: '#10b981', projects: [] as BrowserProject[] },
    };

    filteredProjects.forEach(project => {
      const status = project.status || 'unlabeled';
      if (status in columns) {
        columns[status as keyof typeof columns].projects.push(project);
      } else {
        columns.unlabeled.projects.push(project);
      }
    });

    return columns;
  }, [filteredProjects]);

  const openProject = async (project: BrowserProject) => {
    try {
      if (!model || mode === 'standalone') {
        const url = new URL(window.location.href);
        url.searchParams.set('model', project.id);
        window.location.href = url.toString();
        onOpenProject?.(project.id);
        return;
      }

      if (project.type === 'static') {
        await model.openStaticProject(project.entryPath, { projectId: project.id });
      } else {
        await model.openFile(project.entryPath);
      }

      const url = new URL(window.location.href);
      url.searchParams.set('model', project.id);
      window.history.pushState({}, '', url.toString());

      onOpenProject?.(project.id);
      onHide();
    } catch (err) {
      console.error('Failed to open project:', err);
      setError('Unable to open project. See console for details.');
    }
  };

  const renderProjectCard = (project: BrowserProject, compact = false) => {
    const displayedTags = (project.tags ?? []).slice(0, 3);
    const extraTags = project.tags && project.tags.length > 3 ? project.tags.length - 3 : 0;

    return (
      <article
        key={project.id}
        className={`gallery-card uk-card uk-card-default uk-card-hover ${compact ? 'gallery-card-compact' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Open ${project.title}`}
        onClick={() => openProject(project)}
        onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openProject(project);
          }
        }}
      >
        {project.image && (
          <div className="gallery-card-image">
            <LazyThumbnail src={project.image} alt={`${project.title} preview`} />
          </div>
        )}
        <div className="gallery-card-body">
          <div className="gallery-card-header">
            <h3 className="gallery-card-title">{project.title}</h3>
            {project.category && (
              <span className="gallery-card-category">{project.category}</span>
            )}
          </div>
          {project.description && (
            <p className="gallery-card-description">
              {project.description}
            </p>
          )}
          {(displayedTags.length > 0 || extraTags > 0) && (
            <div className="gallery-card-tags">
              {displayedTags.map(tag => (
                <span key={tag} className="gallery-tag">
                  {tag}
                </span>
              ))}
              {extraTags > 0 && (
                <span className="gallery-tag">+{extraTags}</span>
              )}
            </div>
          )}
        </div>
      </article>
    );
  };
  const toolbar = (
    <section className="gallery-toolbar uk-card uk-card-default uk-card-body uk-padding-small uk-border-rounded">
      <div className="gallery-controls">
        <div className="gallery-field">
          <label htmlFor="gallery-search-input" className="uk-form-label gallery-field-label">
            Search
          </label>
          <div className="uk-inline uk-width-1-1">
            <span className="uk-form-icon">
              <svg
                className="gallery-input-icon"
                aria-hidden="true"
                viewBox="0 0 24 24"
                focusable="false"
              >
                <path
                  d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm9.707 12.293-3.387-3.387a1 1 0 1 0-1.414 1.414l3.387 3.387a1 1 0 0 0 1.414-1.414z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <input
              id="gallery-search-input"
              type="search"
              value={searchTerm}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)}
              placeholder="Search by name, tags, or description"
              className="uk-input gallery-input"
              aria-label="Search projects"
            />
          </div>
        </div>
        {categories.length > 0 && (
          <div className="gallery-field">
            <label htmlFor="gallery-category-select" className="uk-form-label gallery-field-label">
              Category
            </label>
            <select
              id="gallery-category-select"
              value={selectedCategory ?? ''}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                const value = event.target.value;
                setSelectedCategory(value ? value : null);
              }}
              className="uk-select gallery-select"
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {categories.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        )}
        {kanbanEnabled && (
          <div className="gallery-field">
            <label htmlFor="gallery-view-toggle" className="uk-form-label gallery-field-label">
              View
            </label>
            <div className="uk-button-group gallery-view-toggle" role="group" id="gallery-view-toggle">
              <button
                type="button"
                className={`uk-button uk-button-small ${viewMode === 'grid' ? 'uk-button-primary' : 'uk-button-default'}`}
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                <span className="uk-margin-small-left">Grid</span>
              </button>
              <button
                type="button"
                className={`uk-button uk-button-small ${viewMode === 'kanban' ? 'uk-button-primary' : 'uk-button-default'}`}
                onClick={() => setViewMode('kanban')}
                aria-label="Kanban view"
                aria-pressed={viewMode === 'kanban'}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="5" height="18" />
                  <rect x="10" y="3" width="5" height="18" />
                  <rect x="17" y="3" width="5" height="18" />
                </svg>
                <span className="uk-margin-small-left">Kanban</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );

  const body = loading ? (
    <div className="gallery-placeholder uk-card uk-card-body uk-text-center" role="status">
      <div className="gallery-placeholder-icon uk-flex uk-flex-center uk-flex-middle uk-margin-auto">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm6.364 3.636a1 1 0 0 1 0 1.414l-2.829 2.828a1 1 0 0 1-1.414-1.414l2.829-2.828a1 1 0 0 1 1.414 0zM21 11a1 1 0 1 1 0 2h-4a1 1 0 1 1 0-2h4zm-3.636 6.364a1 1 0 0 1-1.414 0l-2.829-2.828a1 1 0 0 1 1.414-1.414l2.829 2.828a1 1 0 0 1 0 1.414zM13 21a1 1 0 1 1-2 0v-4a1 1 0 1 1 2 0v4zm-6.364-3.636a1 1 0 0 1-1.414 0 1 1 0 0 1 0-1.414l2.828-2.829a1 1 0 0 1 1.414 1.414L6.636 17.364zM7 11a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2h4zm2.05-5.657a1 1 0 0 1 1.414 0l2.829 2.828a1 1 0 0 1-1.414 1.414L9.05 6.757a1 1 0 0 1 0-1.414z"
            fill="currentColor"
          />
        </svg>
      </div>
      <span className="uk-text-meta uk-display-block uk-margin-small-top">Loading projects…</span>
    </div>
  ) : filteredProjects.length > 0 ? (
    kanbanEnabled && viewMode === 'kanban' ? (
      <div className="gallery-kanban" data-testid="gallery-kanban">
        {Object.entries(kanbanColumns).map(([key, column]) => (
          <div key={key} className="gallery-kanban-column">
            <div className="gallery-kanban-header" style={{ borderTopColor: column.color }}>
              <div className="gallery-kanban-header-dot" style={{ backgroundColor: column.color }} />
              <h3 className="gallery-kanban-title">{column.title}</h3>
              <span className="gallery-kanban-count uk-badge">{column.projects.length}</span>
            </div>
            <div className="gallery-kanban-body">
              {column.projects.length > 0 ? (
                column.projects.map(project => renderProjectCard(project, true))
              ) : (
                <div className="gallery-kanban-empty uk-text-center uk-text-muted">
                  <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4m0 4h.01" />
                  </svg>
                  <p className="uk-text-small uk-margin-small-top">No projects</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="gallery-grid" data-testid="gallery-grid">
        {filteredProjects.map(project => renderProjectCard(project, false))}
      </div>
    )
  ) : (
    <div className="gallery-placeholder uk-card uk-card-body uk-text-center">
      <div className="gallery-placeholder-icon uk-flex uk-flex-center uk-flex-middle uk-margin-auto">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 5a2 2 0 0 1 2-2h6l2 2h6a2 2 0 0 1 2 2v1H4V5Zm18 5v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9h18Zm-11 3H7v2h4v-2Zm8 0h-6v2h6v-2Z"
            fill="currentColor"
          />
        </svg>
      </div>
      <span className="uk-text-meta uk-display-block uk-margin-small-top">
        No projects match the current filters.
      </span>
    </div>
  );

  const content = (
    <div className="gallery-view">
      {toolbar}
      {error && (
        <div className="gallery-error uk-alert uk-alert-danger" role="alert">
          {error}
        </div>
      )}
      {body}
    </div>
  );

  if (variant === 'fullscreen') {
    if (!visible) return null;

    const showCloseButton = mode !== 'standalone';

    return (
      <div
        className="gallery-fullscreen-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-title"
      >
        <div className="gallery-fullscreen-panel">
          <div className="gallery-fullscreen-inner">
            <header className="gallery-fullscreen-header">
              <div className="gallery-fullscreen-heading">
                <p className="gallery-eyebrow">
                  Model Gallery
                </p>
                <h2 id="gallery-title" className="gallery-title-main">
                  Pick a project to open
                </h2>
                <p className="gallery-subtitle">
                  Browse curated OpenSCAD models and launch them instantly in the viewer.
                </p>
              </div>
              <div className="gallery-header-actions">
                <button
                  type="button"
                  className="gallery-theme-toggle"
                  aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                  onClick={toggleTheme}
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                  {theme === 'light' ? (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                  )}
                </button>
                {showCloseButton && (
                  <button
                    type="button"
                    className="gallery-close-button"
                    aria-label="Close gallery"
                    onClick={onHide}
                    title="Close gallery"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m18 6-12 12" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </header>
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Dialog
      header="Model Gallery"
      visible={visible}
      onHide={onHide}
      style={{ width: 'min(1080px, 95vw)' }}
      breakpoints={{ '960px': '98vw' }}
      dismissableMask
      contentClassName="gallery-dialog-content"
    >
      {content}
    </Dialog>
  );
}
