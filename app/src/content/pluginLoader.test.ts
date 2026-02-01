import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadPluginRegistry,
  loadPluginManifest,
  loadAllPlugins,
  loadPlugin,
  loadLocalPluginDirectory,
  getLocalPluginFile,
  type PluginRegistry,
  type PluginManifest,
  type PluginRegistryEntry,
} from './pluginLoader';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockRegistryEntry: PluginRegistryEntry = {
  id: 'test-plugin',
  name: 'Test Plugin',
  author: 'Test Author',
  description: 'A test plugin',
  baseUrl: 'https://example.com/plugins/test-plugin/',
};

const mockRegistry: PluginRegistry = {
  plugins: [
    mockRegistryEntry,
    {
      id: 'another-plugin',
      name: 'Another Plugin',
      author: 'Another Author',
      description: 'Another test plugin',
      baseUrl: 'https://example.com/plugins/another-plugin/',
    },
  ],
};

const mockManifest: PluginManifest = {
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  description: 'A test plugin manifest',
  assets: ['test-pack.json'],
  scenarios: ['test-scenario.json'],
};

// ============================================================================
// loadPluginRegistry Tests
// ============================================================================

describe('loadPluginRegistry', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should load valid plugin registry', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRegistry),
    });

    const result = await loadPluginRegistry();

    expect(result).toEqual(mockRegistry);
    expect(global.fetch).toHaveBeenCalledWith('/pluginsIndex.json');
  });

  it('should throw on HTTP 404', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(loadPluginRegistry()).rejects.toThrow(
      'Failed to load plugin registry: 404 Not Found',
    );
  });

  it('should throw on HTTP 500', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(loadPluginRegistry()).rejects.toThrow(
      'Failed to load plugin registry: 500 Internal Server Error',
    );
  });

  it('should throw on network error', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error('Network connection failed'));

    await expect(loadPluginRegistry()).rejects.toThrow(
      'Failed to load plugin registry: network error - Network connection failed',
    );
  });

  it('should throw on invalid JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    });

    await expect(loadPluginRegistry()).rejects.toThrow(
      'Failed to parse plugin registry JSON',
    );
  });

  it('should throw when response is not an object', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve('not an object'),
    });

    await expect(loadPluginRegistry()).rejects.toThrow(
      'Invalid plugin registry: expected object',
    );
  });

  it('should throw when response is null', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
    });

    await expect(loadPluginRegistry()).rejects.toThrow(
      'Invalid plugin registry: expected object',
    );
  });

  it('should throw when missing plugins array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ notPlugins: [] }),
    });

    await expect(loadPluginRegistry()).rejects.toThrow(
      'Invalid plugin registry: missing plugins array',
    );
  });

  it('should throw when plugins is not an array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ plugins: 'not an array' }),
    });

    await expect(loadPluginRegistry()).rejects.toThrow(
      'Invalid plugin registry: missing plugins array',
    );
  });

  it('should accept empty plugins array', async () => {
    const emptyRegistry = { plugins: [] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(emptyRegistry),
    });

    const result = await loadPluginRegistry();

    expect(result).toEqual(emptyRegistry);
  });
});

// ============================================================================
// loadPluginManifest Tests
// ============================================================================

describe('loadPluginManifest', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should load valid plugin manifest', async () => {
    const baseUrl = 'https://example.com/plugins/test/';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockManifest),
    });

    const result = await loadPluginManifest(baseUrl);

    expect(result).toEqual(mockManifest);
    expect(global.fetch).toHaveBeenCalledWith(`${baseUrl}index.json`);
  });

  it('should throw on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(
      loadPluginManifest('https://example.com/plugin/'),
    ).rejects.toThrow('Failed to load plugin manifest');
  });

  it('should throw on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failed'));

    await expect(
      loadPluginManifest('https://example.com/plugin/'),
    ).rejects.toThrow(
      /Failed to load plugin manifest from .*: network error - Network failed/,
    );
  });

  it('should throw on invalid JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Bad JSON')),
    });

    await expect(
      loadPluginManifest('https://example.com/plugin/'),
    ).rejects.toThrow('Failed to parse plugin manifest JSON');
  });

  it('should throw when manifest is not an object', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve('not an object'),
    });

    await expect(
      loadPluginManifest('https://example.com/plugin/'),
    ).rejects.toThrow('Invalid plugin manifest: expected object');
  });

  it('should throw when missing id', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: 'Test',
          version: '1.0.0',
          assets: [],
          scenarios: [],
        }),
    });

    await expect(
      loadPluginManifest('https://example.com/plugin/'),
    ).rejects.toThrow('Invalid plugin manifest: missing required fields');
  });

  it('should throw when missing name', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'test',
          version: '1.0.0',
          assets: [],
          scenarios: [],
        }),
    });

    await expect(
      loadPluginManifest('https://example.com/plugin/'),
    ).rejects.toThrow('Invalid plugin manifest: missing required fields');
  });

  it('should throw when missing version', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'test',
          name: 'Test',
          assets: [],
          scenarios: [],
        }),
    });

    await expect(
      loadPluginManifest('https://example.com/plugin/'),
    ).rejects.toThrow('Invalid plugin manifest: missing required fields');
  });

  it('should throw when assets is not an array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          assets: 'not an array',
          scenarios: [],
        }),
    });

    await expect(
      loadPluginManifest('https://example.com/plugin/'),
    ).rejects.toThrow('Invalid plugin manifest: assets must be an array');
  });

  it('should throw when scenarios is not an array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          assets: [],
          scenarios: 'not an array',
        }),
    });

    await expect(
      loadPluginManifest('https://example.com/plugin/'),
    ).rejects.toThrow('Invalid plugin manifest: scenarios must be an array');
  });

  it('should accept optional description field', async () => {
    const manifestWithDesc = {
      ...mockManifest,
      description: 'Optional description',
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(manifestWithDesc),
    });

    const result = await loadPluginManifest('https://example.com/plugin/');

    expect(result.description).toBe('Optional description');
  });
});

// ============================================================================
// loadAllPlugins Tests
// ============================================================================

describe('loadAllPlugins', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should load all plugins successfully', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/pluginsIndex.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRegistry),
        });
      }
      // Plugin manifest requests
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockManifest),
      });
    });

    const result = await loadAllPlugins();

    expect(result).toHaveLength(2);
    expect(result[0].registry).toEqual(mockRegistry.plugins[0]);
    expect(result[0].manifest).toEqual(mockManifest);
  });

  it('should continue loading when one plugin fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/pluginsIndex.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRegistry),
        });
      }
      // First plugin fails, second succeeds
      if (url.includes('test-plugin')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockManifest),
      });
    });

    const result = await loadAllPlugins();

    // Should return only the successful plugin
    expect(result).toHaveLength(1);
    expect(result[0].registry.id).toBe('another-plugin');
  });

  it('should return empty array when registry fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failed'));

    await expect(loadAllPlugins()).rejects.toThrow();
  });

  it('should handle all plugins failing', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/pluginsIndex.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRegistry),
        });
      }
      // All plugin manifests fail
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      });
    });

    const result = await loadAllPlugins();

    expect(result).toHaveLength(0);
  });

  it('should handle empty plugin registry', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ plugins: [] }),
    });

    const result = await loadAllPlugins();

    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// loadPlugin Tests
// ============================================================================

describe('loadPlugin', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should load plugin by ID', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/pluginsIndex.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRegistry),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockManifest),
      });
    });

    const result = await loadPlugin('test-plugin');

    expect(result.registry.id).toBe('test-plugin');
    expect(result.manifest).toEqual(mockManifest);
  });

  it('should throw when plugin not found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRegistry),
    });

    await expect(loadPlugin('nonexistent-plugin')).rejects.toThrow(
      'Plugin not found: nonexistent-plugin',
    );
  });

  it('should throw when registry fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failed'));

    await expect(loadPlugin('test-plugin')).rejects.toThrow();
  });

  it('should throw when manifest fetch fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/pluginsIndex.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRegistry),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
    });

    await expect(loadPlugin('test-plugin')).rejects.toThrow();
  });
});

// ============================================================================
// loadLocalPluginDirectory Tests
// ============================================================================

describe('loadLocalPluginDirectory', () => {
  it('should throw when user cancels directory selection', async () => {
    // Mock document.createElement to return a mock input element
    const mockInput = {
      type: '',
      webkitdirectory: false,
      multiple: false,
      click: vi.fn(),
      onchange: null as ((this: HTMLInputElement) => void) | null,
      oncancel: null as ((this: HTMLInputElement) => void) | null,
      files: null as FileList | null,
    };

    vi.spyOn(document, 'createElement').mockReturnValue(
      mockInput as unknown as HTMLInputElement,
    );

    const loadPromise = loadLocalPluginDirectory();

    // Simulate user cancellation
    if (mockInput.oncancel) {
      mockInput.oncancel.call(mockInput as unknown as HTMLInputElement);
    }

    await expect(loadPromise).rejects.toThrow('No directory selected');
  });

  it('should throw when no files selected', async () => {
    const mockInput = {
      type: '',
      webkitdirectory: false,
      multiple: false,
      click: vi.fn(),
      onchange: null as ((this: HTMLInputElement) => void) | null,
      oncancel: null as ((this: HTMLInputElement) => void) | null,
      files: [] as unknown as FileList,
    };

    vi.spyOn(document, 'createElement').mockReturnValue(
      mockInput as unknown as HTMLInputElement,
    );

    const loadPromise = loadLocalPluginDirectory();

    // Simulate empty file selection
    mockInput.files = { length: 0 } as FileList;
    if (mockInput.onchange) {
      mockInput.onchange.call(mockInput as unknown as HTMLInputElement);
    }

    await expect(loadPromise).rejects.toThrow('No directory selected');
  });

  it('should throw when index.json not found', async () => {
    const mockFiles = [
      { name: 'other-file.json', text: () => Promise.resolve('{}') },
      { name: 'asset.json', text: () => Promise.resolve('{}') },
    ];

    const mockInput = {
      type: '',
      webkitdirectory: false,
      multiple: false,
      click: vi.fn(),
      onchange: null as ((this: HTMLInputElement) => void) | null,
      oncancel: null as ((this: HTMLInputElement) => void) | null,
      files: null as FileList | null,
    };

    vi.spyOn(document, 'createElement').mockReturnValue(
      mockInput as unknown as HTMLInputElement,
    );

    const loadPromise = loadLocalPluginDirectory();

    // Simulate file selection without index.json
    mockInput.files = {
      ...mockFiles,
      length: mockFiles.length,
    } as unknown as FileList;

    if (mockInput.onchange) {
      mockInput.onchange.call(mockInput as unknown as HTMLInputElement);
    }

    await expect(loadPromise).rejects.toThrow(
      'No index.json found in selected directory',
    );
  });

  it('should throw on invalid manifest JSON', async () => {
    const mockFiles = [
      {
        name: 'index.json',
        text: () => Promise.resolve('{invalid json}'),
      },
    ];

    const mockInput = {
      type: '',
      webkitdirectory: false,
      multiple: false,
      click: vi.fn(),
      onchange: null as ((this: HTMLInputElement) => void) | null,
      oncancel: null as ((this: HTMLInputElement) => void) | null,
      files: null as FileList | null,
    };

    vi.spyOn(document, 'createElement').mockReturnValue(
      mockInput as unknown as HTMLInputElement,
    );

    const loadPromise = loadLocalPluginDirectory();

    mockInput.files = {
      ...mockFiles,
      length: mockFiles.length,
    } as unknown as FileList;

    if (mockInput.onchange) {
      mockInput.onchange.call(mockInput as unknown as HTMLInputElement);
    }

    await expect(loadPromise).rejects.toThrow();
  });

  it('should throw when manifest missing required fields', async () => {
    const mockFiles = [
      {
        name: 'index.json',
        text: () => Promise.resolve(JSON.stringify({ name: 'Test' })), // Missing id, version
      },
    ];

    const mockInput = {
      type: '',
      webkitdirectory: false,
      multiple: false,
      click: vi.fn(),
      onchange: null as ((this: HTMLInputElement) => void) | null,
      oncancel: null as ((this: HTMLInputElement) => void) | null,
      files: null as FileList | null,
    };

    vi.spyOn(document, 'createElement').mockReturnValue(
      mockInput as unknown as HTMLInputElement,
    );

    const loadPromise = loadLocalPluginDirectory();

    mockInput.files = {
      ...mockFiles,
      length: mockFiles.length,
    } as unknown as FileList;

    if (mockInput.onchange) {
      mockInput.onchange.call(mockInput as unknown as HTMLInputElement);
    }

    await expect(loadPromise).rejects.toThrow(
      'Invalid plugin manifest: missing required fields',
    );
  });

  it('should load valid local plugin', async () => {
    const validManifest = {
      id: 'local-test',
      name: 'Local Test Plugin',
      version: '1.0.0',
      assets: ['asset1.json'],
      scenarios: ['scenario1.json'],
    };

    const mockFiles = [
      {
        name: 'index.json',
        text: () => Promise.resolve(JSON.stringify(validManifest)),
      },
      {
        name: 'asset1.json',
        text: () => Promise.resolve('{}'),
      },
      {
        name: 'scenario1.json',
        text: () => Promise.resolve('{}'),
      },
    ];

    const mockInput = {
      type: '',
      webkitdirectory: false,
      multiple: false,
      click: vi.fn(),
      onchange: null as ((this: HTMLInputElement) => void) | null,
      oncancel: null as ((this: HTMLInputElement) => void) | null,
      files: null as FileList | null,
    };

    vi.spyOn(document, 'createElement').mockReturnValue(
      mockInput as unknown as HTMLInputElement,
    );

    const loadPromise = loadLocalPluginDirectory();

    mockInput.files = {
      ...mockFiles,
      length: mockFiles.length,
    } as unknown as FileList;

    if (mockInput.onchange) {
      mockInput.onchange.call(mockInput as unknown as HTMLInputElement);
    }

    const result = await loadPromise;

    expect(result.manifest.id).toBe('local-test');
    expect(result.files.size).toBe(3);
    expect(result.files.has('index.json')).toBe(true);
  });

  it('should throw when manifest-referenced files are missing', async () => {
    const validManifest = {
      id: 'local-test',
      name: 'Local Test Plugin',
      version: '1.0.0',
      assets: ['missing-asset.json', 'another-missing.json'],
      scenarios: ['missing-scenario.json'],
    };

    const mockFiles = [
      {
        name: 'index.json',
        text: () => Promise.resolve(JSON.stringify(validManifest)),
      },
      // Not including the referenced files
    ];

    const mockInput = {
      type: '',
      webkitdirectory: false,
      multiple: false,
      click: vi.fn(),
      onchange: null as ((this: HTMLInputElement) => void) | null,
      oncancel: null as ((this: HTMLInputElement) => void) | null,
      files: null as FileList | null,
    };

    vi.spyOn(document, 'createElement').mockReturnValue(
      mockInput as unknown as HTMLInputElement,
    );

    const loadPromise = loadLocalPluginDirectory();

    mockInput.files = {
      ...mockFiles,
      length: mockFiles.length,
    } as unknown as FileList;

    if (mockInput.onchange) {
      mockInput.onchange.call(mockInput as unknown as HTMLInputElement);
    }

    await expect(loadPromise).rejects.toThrow(
      'Local plugin incomplete: missing files declared in manifest',
    );
  });
});

// ============================================================================
// getLocalPluginFile Tests
// ============================================================================

describe('getLocalPluginFile', () => {
  it('should return file content', async () => {
    const fileContent = '{"test": "data"}';
    const mockFile = {
      text: () => Promise.resolve(fileContent),
    } as File;

    const plugin = {
      manifest: mockManifest,
      files: new Map([['test.json', mockFile]]),
    };

    const result = await getLocalPluginFile(plugin, 'test.json');

    expect(result).toBe(fileContent);
  });

  it('should throw when file not found', async () => {
    const plugin = {
      manifest: mockManifest,
      files: new Map(),
    };

    await expect(
      getLocalPluginFile(plugin, 'nonexistent.json'),
    ).rejects.toThrow('File not found in local plugin: nonexistent.json');
  });

  it('should handle file read errors', async () => {
    const mockFile = {
      text: () => Promise.reject(new Error('File read failed')),
    } as File;

    const plugin = {
      manifest: mockManifest,
      files: new Map([['error.json', mockFile]]),
    };

    await expect(getLocalPluginFile(plugin, 'error.json')).rejects.toThrow(
      'File read failed',
    );
  });
});
