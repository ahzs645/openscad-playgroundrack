import React, { CSSProperties, useContext, useMemo, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { OverlayPanel } from 'primereact/overlaypanel';
import { InputText } from 'primereact/inputtext';
import { ModelContext } from './contexts.ts';
import { buildShareUrl, computeChangedVars, getModelIdFromUrl } from '../state/share-link.ts';

export default function ShareButton({className, style}: {className?: string, style?: CSSProperties}) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const state = model.state;

  const toast = useRef<Toast>(null);
  const overlay = useRef<OverlayPanel>(null);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const changedCount = useMemo(() => Object.keys(computeChangedVars(state)).length, [state.params.vars, state.parameterSet]);
  const modelId = getModelIdFromUrl();
  const disabled = !modelId || changedCount === 0 || busy;

  const tooltip = !modelId
    ? 'Share links require a model loaded via ?model='
    : changedCount === 0
      ? 'Change a parameter from its default to create a share link'
      : `Share ${changedCount} parameter change${changedCount === 1 ? '' : 's'}`;

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    setBusy(true);
    try {
      const url = await buildShareUrl(state);
      if (!url) {
        toast.current?.show({severity: 'warn', summary: 'Nothing to share', detail: 'No parameter changes detected.', life: 3000});
        return;
      }
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.current?.show({severity: 'success', summary: 'Link copied!', detail: 'Share link copied to clipboard.', life: 2500});
      } catch {
        // Clipboard may be unavailable (insecure context, permission). Fall through to overlay.
      }
      overlay.current?.toggle(e);
    } catch (err) {
      console.error('Share failed:', err);
      toast.current?.show({severity: 'error', summary: 'Share failed', detail: String(err), life: 4000});
    } finally {
      setBusy(false);
    }
  };

  const copyAgain = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.current?.show({severity: 'success', summary: 'Copied', life: 1500});
    } catch (err) {
      toast.current?.show({severity: 'error', summary: 'Copy failed', detail: String(err), life: 3000});
    }
  };

  return (
    <div className={className} style={style}>
      <Button
        icon="pi pi-share-alt"
        label="Share"
        tooltip={tooltip}
        tooltipOptions={{position: 'top'}}
        disabled={disabled}
        severity="secondary"
        className="p-button-sm"
        onClick={handleClick}
      />
      <OverlayPanel ref={overlay} style={{maxWidth: '90vw'}}>
        <div className="flex flex-column gap-2" style={{minWidth: '320px'}}>
          <label style={{fontSize: '0.85rem', fontWeight: 600}}>Share link</label>
          <div className="p-inputgroup">
            <InputText value={shareUrl} readOnly onFocus={(e) => e.currentTarget.select()} />
            <Button icon="pi pi-copy" onClick={copyAgain} tooltip="Copy" tooltipOptions={{position: 'top'}} />
          </div>
          <small style={{color: '#666'}}>Encodes {changedCount} changed parameter{changedCount === 1 ? '' : 's'}.</small>
        </div>
      </OverlayPanel>
      <Toast ref={toast} />
    </div>
  );
}
