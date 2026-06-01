import { ConfigManager, DEFAULT_CONFIG, CollaborationConfig } from '../configSchema'

describe('ConfigManager', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        warnSpy.mockRestore()
        vi.unstubAllGlobals()
    })

    describe('default config loading', () => {
        it('should return DEFAULT_CONFIG when created with no arguments', () => {
            const manager = new ConfigManager()
            const config = manager.getConfig()

            expect(config).toEqual(DEFAULT_CONFIG)
        })

        it('should return default agenda.stateTimeouts values', () => {
            const manager = new ConfigManager()
            const config = manager.getConfig()

            expect(config.agenda.stateTimeouts.idle).toBe(0)
            expect(config.agenda.stateTimeouts.open_topic).toBe(300_000)
            expect(config.agenda.stateTimeouts.discussion).toBe(600_000)
            expect(config.agenda.stateTimeouts.proposal).toBe(120_000)
            expect(config.agenda.stateTimeouts.voting).toBe(180_000)
            expect(config.agenda.stateTimeouts.emergency).toBe(300_000)
        })

        it('should return default communication.dlqThreshold as 10', () => {
            const manager = new ConfigManager()
            const config = manager.getConfig()

            expect(config.communication.dlqThreshold).toBe(10)
        })
    })

    describe('config deep merge', () => {
        it('should override only the specified value', () => {
            const manager = new ConfigManager({ communication: { dlqThreshold: 99 } })
            const config = manager.getConfig()

            expect(config.communication.dlqThreshold).toBe(99)
        })

        it('should keep other communication values at defaults when partially overriding', () => {
            const manager = new ConfigManager({ communication: { dlqThreshold: 99 } })
            const config = manager.getConfig()

            expect(config.communication.dedupTtlMs).toBe(DEFAULT_CONFIG.communication.dedupTtlMs)
            expect(config.communication.maxRetries).toBe(DEFAULT_CONFIG.communication.maxRetries)
            expect(config.communication.retryDelayMs).toBe(DEFAULT_CONFIG.communication.retryDelayMs)
        })

        it('should keep unrelated sections unchanged when overriding communication', () => {
            const manager = new ConfigManager({ communication: { dlqThreshold: 99 } })
            const config = manager.getConfig()

            expect(config.agenda).toEqual(DEFAULT_CONFIG.agenda)
            expect(config.approval).toEqual(DEFAULT_CONFIG.approval)
            expect(config.compensation).toEqual(DEFAULT_CONFIG.compensation)
            expect(config.security).toEqual(DEFAULT_CONFIG.security)
            expect(config.tracing).toEqual(DEFAULT_CONFIG.tracing)
            expect(config.metrics).toEqual(DEFAULT_CONFIG.metrics)
        })
    })

    describe('config validation', () => {
        it('should reject updateConfig with invalid agenda.tokenDuration and keep config unchanged', () => {
            const manager = new ConfigManager()
            const before = manager.getConfig()

            manager.updateConfig({ agenda: { tokenDuration: -1 } as any })

            const after = manager.getConfig()
            expect(after).toEqual(before)
        })

        it('should log a warning when validation fails', () => {
            const manager = new ConfigManager()
            manager.updateConfig({ agenda: { tokenDuration: -1 } as any })

            expect(warnSpy).toHaveBeenCalled()
            const warnMessages = warnSpy.mock.calls.map(c => c[0])
            expect(warnMessages.some((m: string) => m.includes('tokenDuration'))).toBe(true)
            expect(warnMessages.some((m: string) => m.includes('rejected'))).toBe(true)
        })
    })

    describe('runtime update and listener notification', () => {
        it('should call listener with updated config after updateConfig', () => {
            const manager = new ConfigManager()
            const listener = vi.fn()
            manager.addListener(listener)

            manager.updateConfig({ communication: { dlqThreshold: 42 } })

            expect(listener).toHaveBeenCalledTimes(1)
            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    communication: expect.objectContaining({ dlqThreshold: 42 }),
                }),
            )
        })

        it('should pass a clone to the listener, not the internal object', () => {
            const manager = new ConfigManager()
            const receivedConfigs: CollaborationConfig[] = []
            manager.addListener((config) => {
                receivedConfigs.push(config)
            })

            manager.updateConfig({ communication: { dlqThreshold: 42 } })

            const received = receivedConfigs[0]
            received.communication.dlqThreshold = 999

            const current = manager.getConfig()
            expect(current.communication.dlqThreshold).toBe(42)
        })
    })

    describe('listener removal', () => {
        it('should not call a removed listener after updateConfig', () => {
            const manager = new ConfigManager()
            const listener = vi.fn()
            manager.addListener(listener)
            manager.removeListener(listener)

            manager.updateConfig({ communication: { dlqThreshold: 55 } })

            expect(listener).not.toHaveBeenCalled()
        })
    })

    describe('localStorage persistence', () => {
        function createLocalStorageMock() {
            const store: Record<string, string> = {}
            return {
                getItem: vi.fn((key: string) => store[key] ?? null),
                setItem: vi.fn((key: string, value: string) => {
                    store[key] = value
                }),
                removeItem: vi.fn((key: string) => {
                    delete store[key]
                }),
                clear: vi.fn(() => {
                    for (const key of Object.keys(store)) {
                        delete store[key]
                    }
                }),
            }
        }

        it('should save config to localStorage on updateConfig', () => {
            const mock = createLocalStorageMock()
            vi.stubGlobal('localStorage', mock)

            const manager = new ConfigManager(undefined, { persistKey: 'test-config' })
            manager.updateConfig({ communication: { dlqThreshold: 77 } })

            expect(mock.setItem).toHaveBeenCalledWith(
                'test-config',
                expect.any(String),
            )
            const saved = JSON.parse(mock.setItem.mock.calls.at(-1)![1])
            expect(saved.communication.dlqThreshold).toBe(77)
        })

        it('should load previously saved config from localStorage', () => {
            const mock = createLocalStorageMock()
            const partialConfig = { communication: { dlqThreshold: 88 } }
            mock.getItem = vi.fn((key: string) => {
                if (key === 'test-config') return JSON.stringify(partialConfig)
                return null
            })
            vi.stubGlobal('localStorage', mock)

            const manager = new ConfigManager(undefined, { persistKey: 'test-config' })
            const config = manager.getConfig()

            expect(config.communication.dlqThreshold).toBe(88)
            expect(config.communication.dedupTtlMs).toBe(DEFAULT_CONFIG.communication.dedupTtlMs)
        })

        it('should clear localStorage via clearStorage', () => {
            const mock = createLocalStorageMock()
            vi.stubGlobal('localStorage', mock)

            const manager = new ConfigManager(undefined, { persistKey: 'test-config' })
            manager.updateConfig({ communication: { dlqThreshold: 77 } })
            manager.clearStorage()

            expect(mock.removeItem).toHaveBeenCalledWith('test-config')
        })
    })
})
