// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { CSSProperties, useContext, useState, useEffect, useRef } from 'react';
import { ModelContext, FSContext } from './contexts.ts';

import { Dropdown } from 'primereact/dropdown';
import { Slider } from 'primereact/slider';
import { Checkbox } from 'primereact/checkbox';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { Fieldset } from 'primereact/fieldset';
import { Parameter } from '../state/customizer-types.ts';
import { Button } from 'primereact/button';
import { readFileAsDataURL } from '../utils.ts';

type PresetData = {
  fileFormatVersion: string;
  parameterSets: {
    [key: string]: {
      [param: string]: string;
    };
  };
};

export default function CustomizerPanel({className, style}: {className?: string, style?: CSSProperties}) {

  const model = useContext(ModelContext);
  const fs = useContext(FSContext);
  if (!model) throw new Error('No model');

  const state = model.state;

  const [presetData, setPresetData] = useState<PresetData | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Check for main.json in the same directory as the active file
  useEffect(() => {
    const activePath = state.params.activePath;
    console.log('Checking for main.json, activePath:', activePath);

    if (!activePath || !activePath.endsWith('.scad')) {
      console.log('Skipping main.json check:', { activePath });
      setPresetData(null);
      return;
    }

    const directory = activePath.substring(0, activePath.lastIndexOf('/'));
    const mainJsonPath = `${directory}/main.json`;
    const mainJsonPathAlt = `${directory}/Main.json`; // Try alternate capitalization

    console.log('Looking for main.json at:', mainJsonPath);

    // For Models loaded from HTTP, fetch Main.json via HTTP
    if (activePath.startsWith('/libraries/Models/')) {
      const httpDirectory = directory.replace('/libraries/Models/', '/Models/');
      const httpMainJsonPath = `${httpDirectory}/Main.json`;
      const httpMainJsonPathAlt = `${httpDirectory}/main.json`;

      console.log('Fetching main.json via HTTP:', httpMainJsonPath);

      (async () => {
        try {
          let response = await fetch(httpMainJsonPath);
          if (!response.ok) {
            response = await fetch(httpMainJsonPathAlt);
          }
          if (response.ok) {
            const content = await response.text();
            const parsed = JSON.parse(content) as PresetData;
            console.log('Loaded preset data from HTTP:', parsed);
            setPresetData(parsed);
          } else {
            console.log('main.json not found via HTTP');
            setPresetData(null);
          }
        } catch (error) {
          console.warn('Error fetching main.json:', error);
          setPresetData(null);
        }
      })();
      return;
    }

    // For local files, try reading from filesystem
    if (!fs) {
      console.log('No filesystem available');
      setPresetData(null);
      return;
    }

    try {
      const bfs = fs as any;
      let foundPath: string | null = null;

      // Try both lowercase and capitalized versions
      if (typeof bfs?.existsSync === 'function') {
        if (bfs.existsSync(mainJsonPath)) {
          foundPath = mainJsonPath;
        } else if (bfs.existsSync(mainJsonPathAlt)) {
          foundPath = mainJsonPathAlt;
        }
      }

      if (foundPath) {
        console.log('Found main.json at:', foundPath);
        const content = bfs.readFileSync(foundPath, 'utf-8');
        const parsed = JSON.parse(content) as PresetData;
        console.log('Loaded preset data:', parsed);
        setPresetData(parsed);
      } else {
        console.log('main.json not found');
        setPresetData(null);
      }
    } catch (error) {
      console.warn('Error reading main.json:', error);
      setPresetData(null);
    }
  }, [state.params.activePath, fs]);

  const handlePresetChange = (presetName: string | null) => {
    console.log('Preset changed to:', presetName);
    setSelectedPreset(presetName);
    if (presetName && presetData?.parameterSets[presetName]) {
      const presetParams = presetData.parameterSets[presetName];
      console.log('Applying preset parameters:', presetParams);
      // Apply all preset parameters
      Object.entries(presetParams).forEach(([name, value]) => {
        // Parse the value based on the parameter type
        let parsedValue: any = value;
        const param = state.parameterSet?.parameters.find(p => p.name === name);
        if (param) {
          if (param.type === 'number') {
            parsedValue = parseFloat(value);
          } else if (param.type === 'boolean') {
            parsedValue = value === 'true';
          }
        }
        console.log(`Setting ${name} = ${parsedValue} (type: ${typeof parsedValue})`);
        model.setVar(name, parsedValue);
      });
    }
  };

  const presetOptions = presetData
    ? Object.keys(presetData.parameterSets).map(name => ({ label: name, value: name }))
    : [];

  const handleChange = (name: string, value: any) => {
    model.setVar(name, value);
  };

  const groupedParameters = (state.parameterSet?.parameters ?? []).reduce((acc, param) => {
    if (!acc[param.group]) {
      acc[param.group] = [];
    }
    acc[param.group].push(param);
    return acc;
  }, {} as { [key: string]: any[] });

  const groups = Object.entries(groupedParameters);
  const collapsedTabSet = new Set(state.view.collapsedCustomizerTabs ?? []);
  const setTabOpen = (name: string, open: boolean) => {
    if (open) {
      collapsedTabSet.delete(name);
    } else {
      collapsedTabSet.add(name)
    }
    model.mutate(s => s.view.collapsedCustomizerTabs = Array.from(collapsedTabSet));
  }

  return (
    <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
          overflow: 'scroll',
          ...style,
          bottom: 'unset',
        }}>
      {presetOptions.length > 0 && (
        <div style={{
          margin: '10px 10px 5px 10px',
          padding: '10px',
          backgroundColor: 'rgba(255,255,255,0.4)',
          borderRadius: '6px',
        }}>
          <label style={{ fontWeight: 'bold', marginBottom: '5px', display: 'block' }}>
            Preset
          </label>
          <Dropdown
            value={selectedPreset}
            options={presetOptions}
            onChange={(e) => handlePresetChange(e.value)}
            placeholder="Select a preset..."
            style={{ width: '100%' }}
            showClear
          />
        </div>
      )}
      {groups.map(([group, params]) => (
        <Fieldset 
            style={{
              margin: '5px 10px 5px 10px',
              // backgroundColor: 'transparent',
              backgroundColor: 'rgba(255,255,255,0.4)',
            }}
            onCollapse={() => setTabOpen(group, false)}
            onExpand={() => setTabOpen(group, true)}
            collapsed={collapsedTabSet.has(group)}
            key={group}
            legend={group}
            toggleable={true}>
          {params.map((param) => (
            <ParameterInput
              key={param.name}
              value={(state.params.vars ?? {})[param.name]}
              param={param}
              handleChange={handleChange} />
          ))}
        </Fieldset>
      ))}
    </div>
  );
};

function ParameterInput({param, value, className, style, handleChange}: {param: Parameter, value: any, className?: string, style?: CSSProperties, handleChange: (key: string, value: any) => void}) {
  const model = useContext(ModelContext);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isSvgFileParam = param.type === 'string' && param.name === 'svg_file';
  const isStampKnubParam = param.type === 'string' && param.name === 'stamp_knub';
  const isFileUploadParam = isSvgFileParam || isStampKnubParam;

  const handleFileUploadChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!model) return;
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    const activePath = model.state.params.activePath;
    const lastSlash = activePath.lastIndexOf('/');
    const baseDir = lastSlash >= 0 ? activePath.substring(0, lastSlash) : '/';
    const targetPath = `${baseDir}/${file.name}`;

    if (isSvgFileParam) {
      const content = await file.text();

      model.mutate(s => {
        const existing = s.params.sources ?? [];
        const updated = [...existing];
        const index = updated.findIndex(src => src.path === targetPath);
        if (index >= 0) {
          updated[index] = {...updated[index], content};
        } else {
          updated.push({path: targetPath, content});
        }
        s.params.sources = updated;
      });
    } else if (isStampKnubParam) {
      const dataUrl = await readFileAsDataURL(file);

      model.mutate(s => {
        const existing = s.params.sources ?? [];
        const updated = [...existing];
        const index = updated.findIndex(src => src.path === targetPath);
        if (index >= 0) {
          updated[index] = {...updated[index], url: dataUrl};
        } else {
          updated.push({path: targetPath, url: dataUrl});
        }
        s.params.sources = updated;
      });
    }

    handleChange(param.name, file.name);
    model.render({isPreview: true, now: true});

    // Allow re-selecting the same file later.
    event.target.value = '';
  };

  return (
    <div 
      style={{
        flex: 1,
        ...style,
        display: 'flex',
        flexDirection: 'column',
      }}>
      <div 
        style={{
          flex: 1,
          display: 'flex',
          margin: '10px -10px 10px 5px',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <div 
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}>
          <label><b>{param.name}</b></label>
          <div>{param.caption}</div>
        </div>
        <div 
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          {param.type === 'number' && 'options' in param && (
            <Dropdown
              style={{flex: 1}}
              value={value || param.initial}
              options={param.options}
              onChange={(e) => handleChange(param.name, e.value)}
              optionLabel="name"
              optionValue="value"
            />
          )}
          {param.type === 'string' && param.options && (
            <Dropdown
              value={value || param.initial}
              options={param.options}
              onChange={(e) => handleChange(param.name, e.value)}
              optionLabel="name"
              optionValue="value"
            />
          )}
          {param.type === 'boolean' && (
            <Checkbox
              checked={value ?? param.initial}
              onChange={(e) => handleChange(param.name, e.checked)}
            />
          )}
          {!Array.isArray(param.initial) && param.type === 'number' && !('options' in param) && (
            <InputNumber
              value={value || param.initial}
              showButtons
              size={5}
              onValueChange={(e) => handleChange(param.name, e.value)}
            />
          )}
          {param.type === 'string' && !param.options && (
            <>
              <InputText
                style={{flex: 1}}
                value={value || param.initial}
                onChange={(e) => handleChange(param.name, e.target.value)}
              />
              {isFileUploadParam && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={
                      isSvgFileParam
                        ? ".svg,image/svg+xml"
                        : isStampKnubParam
                          ? ".stl,model/stl"
                          : undefined
                    }
                    style={{ display: 'none' }}
                    onChange={handleFileUploadChange}
                  />
                  <Button
                    icon="pi pi-upload"
                    className="p-button-text"
                    style={{ marginLeft: '0.5rem' }}
                    onClick={() => fileInputRef.current?.click()}
                    title={isSvgFileParam ? "Upload SVG file" : "Upload STL file"}
                  />
                </>
              )}
            </>
          )}
          {Array.isArray(param.initial) && 'min' in param && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'row',
            }}>
              {param.initial.map((_, index) => (
                <InputNumber
                  style={{flex: 1}}
                  key={index}
                  value={value?.[index] ?? (param.initial as any)[index]}
                  min={param.min}
                  max={param.max}
                  showButtons
                  size={5}
                  step={param.step}
                  onValueChange={(e) => {
                    const newArray = [...(value ?? param.initial)];
                    newArray[index] = e.value;
                    handleChange(param.name, newArray);
                  }}
                />
              ))}
            </div>
          )}
          <Button
            onClick={() => handleChange(param.name, param.initial)}
            style={{
              marginRight: '0',
              visibility: value === undefined || (JSON.stringify(value) === JSON.stringify(param.initial)) ? 'hidden' : 'visible',
            }}
            tooltipOptions={{position: 'left'}}
            icon='pi pi-refresh'
            className='p-button-text'/>
        </div>
      </div>
      {!Array.isArray(param.initial) && param.type === 'number' && param.min !== undefined && (
        <Slider
          style={{
            flex: 1,
            minHeight: '5px',
            margin: '5px 40px 5px 5px',
          }}
          value={value || param.initial}
          min={param.min}
          max={param.max}
          step={param.step}
          onChange={(e) => handleChange(param.name, e.value)}
        />
      )}
    </div>
  );
}
