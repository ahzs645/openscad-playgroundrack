import React, { useContext } from 'react';
import { ModelContext } from './contexts.ts';
import { capabilitiesForPath, ExportFormat3D } from '../state/engine.ts';

import { SplitButton } from 'primereact/splitbutton';
import { MenuItem } from 'primereact/menuitem';

type ExtendedMenuItem = MenuItem & { buttonLabel?: string };

export default function ExportButton({className, style}: {className?: string, style?: React.CSSProperties}) {
    const model = useContext(ModelContext);
    if (!model) throw new Error('No model');
    const state = model.state;
    const capabilities = capabilitiesForPath(state.params.activePath);

    const format3DItems: Record<ExportFormat3D, ExtendedMenuItem> = {
      glb: {
        data: 'glb',
        buttonLabel: 'Download GLB',
        label: 'GLB (binary glTF)',
        icon: 'pi pi-file',
        command: () => model!.setFormats(undefined, 'glb'),
      },
      stl: {
        data: 'stl',
        buttonLabel: 'Download STL',
        label: capabilities.id === 'occt' ? 'STL (ascii)' : 'STL (binary)',
        icon: 'pi pi-file',
        command: () => model!.setFormats(undefined, 'stl'),
      },
      off: {
        data: 'off',
        buttonLabel: 'Download OFF',
        label: 'OFF (Object File Format)',
        icon: 'pi pi-file',
        command: () => model!.setFormats(undefined, 'off'),
      },
      '3mf': {
        data: '3mf',
        buttonLabel: 'Download 3MF',
        label: '3MF (Multimaterial)',
        icon: 'pi pi-file',
        command: () => model!.setFormats(undefined, '3mf'),
      },
      step: {
        data: 'step',
        buttonLabel: 'Download STEP',
        label: 'STEP',
        icon: 'pi pi-file-export',
        command: () => model!.setFormats(undefined, 'step'),
      },
    };

    const stepItems = capabilities.stepExportModes.map((mode): ExtendedMenuItem => {
      if (mode.id === 'openscad-csg-32') {
        return {
          data: 'step',
          buttonLabel: 'Download STEP',
          label: mode.label,
          icon: 'pi pi-file-export',
          command: () => {
            model!.setOcctStepExportArch('32');
            model!.setFormats(undefined, 'step');
          },
        };
      }
      if (mode.id === 'openscad-csg-64-mt') {
        return {
          data: 'step-64-mt',
          buttonLabel: 'Download STEP',
          label: mode.label,
          icon: 'pi pi-server',
          command: () => {
            model!.setOcctStepExportArch('64-mt');
            model!.setFormats(undefined, 'step');
          },
        };
      }
      return {
        data: 'step',
        buttonLabel: 'Download STEP',
        label: mode.label,
        icon: 'pi pi-file-export',
        command: () => model!.setFormats(undefined, 'step'),
      };
    });

    const dropdownModel: ExtendedMenuItem[] =
      state.is2D && capabilities.export2D.length > 0 ? [
        {
          data: 'svg',
          buttonLabel: 'SVG',
          label: 'SVG (Simple Vector Graphics)',
          icon: 'pi pi-download',
          command: () => model!.setFormats('svg', undefined),
        },
        {
          data: 'dxf',
          buttonLabel: 'DXF',
          label: 'DXF (Drawing Exchange Format)',
          icon: 'pi pi-download',
          command: () => model!.setFormats('dxf', undefined),
        },
      ] : [
        ...capabilities.export3D.filter(format => format !== 'step').map(format => format3DItems[format]),
        ...stepItems,
        ...(capabilities.export3D.includes('3mf') ? [
          {
            separator: true
          },
          {
            label: 'Edit materials' + ((state.params.extruderColors ?? []).length > 0 ? ` (${(state.params.extruderColors ?? []).length})` : ''),
            icon: 'pi pi-cog',
            command: () => model!.mutate(s => s.view.extruderPickerVisibility = 'editing'),
          }
        ] : []),
      ];

    const exportFormat = state.is2D ? state.params.exportFormat2D : state.params.exportFormat3D;
    const selectedItem = dropdownModel.filter(item => item.data === exportFormat)[0] || dropdownModel[0]!;

  return (
    <div className={className} style={style}>
      <SplitButton 
        label={selectedItem.buttonLabel}
        disabled={!state.output || state.output.isPreview || state.rendering || state.exporting}
        icon="pi pi-download" 
        model={dropdownModel}
        severity="secondary"
        onClick={e => model!.export()}
        className="p-button-sm"
      />
    </div>
  );
}
