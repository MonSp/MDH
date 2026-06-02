import {
  AgentConfig,
  AgentInstance,
  AgentInstanceStatus,
  AgentRole,
  AgentCapability,
  createAgentConfig,
  createAgentInstance,
  DEFAULT_AGENT_CONFIGS,
} from './agentTypes'

export class AgentRegistry {
  private configs: Map<string, AgentConfig> = new Map()
  private instances: Map<string, AgentInstance> = new Map()

  registerConfig(config: AgentConfig): void {
    this.configs.set(config.id, config)
  }

  registerDefaultConfig(role: AgentRole, name: string, model: AgentConfig['model']): AgentConfig {
    const defaults = DEFAULT_AGENT_CONFIGS[role]
    const config = createAgentConfig(name, role, defaults.capabilities ?? [], model, {
      maxConcurrentTasks: defaults.maxConcurrentTasks,
      timeout: defaults.timeout,
    })
    this.configs.set(config.id, config)
    return config
  }

  unregisterConfig(configId: string): boolean {
    const relatedInstances = this.getInstancesByConfig(configId)
    if (relatedInstances.length > 0) {
      return false
    }
    return this.configs.delete(configId)
  }

  getConfig(configId: string): AgentConfig | undefined {
    return this.configs.get(configId)
  }

  getAllConfigs(): AgentConfig[] {
    return Array.from(this.configs.values())
  }

  getConfigsByRole(role: AgentRole): AgentConfig[] {
    return this.getAllConfigs().filter(c => c.role === role)
  }

  getConfigsByCapability(capability: AgentCapability): AgentConfig[] {
    return this.getAllConfigs().filter(c => c.capabilities.includes(capability))
  }

  spawnInstance(configId: string, skillOptions?: { skillId?: string; skillPath?: string }): AgentInstance | null {
    const config = this.configs.get(configId)
    if (!config) return null

    const existingInstances = this.getInstancesByConfig(configId)
    const activeInstances = existingInstances.filter(
      i => i.status !== AgentInstanceStatus.Offline && i.status !== AgentInstanceStatus.Error,
    )

    if (activeInstances.length >= config.maxConcurrentTasks) {
      return null
    }

    const instance = createAgentInstance(configId, skillOptions)
    this.instances.set(instance.id, instance)
    return instance
  }

  removeInstance(instanceId: string): boolean {
    return this.instances.delete(instanceId)
  }

  getInstance(instanceId: string): AgentInstance | undefined {
    return this.instances.get(instanceId)
  }

  getAllInstances(): AgentInstance[] {
    return Array.from(this.instances.values())
  }

  getInstancesByConfig(configId: string): AgentInstance[] {
    return this.getAllInstances().filter(i => i.configId === configId)
  }

  getInstancesByStatus(status: AgentInstanceStatus): AgentInstance[] {
    return this.getAllInstances().filter(i => i.status === status)
  }

  getInstancesByRole(role: AgentRole): AgentInstance[] {
    return this.getAllInstances().filter(i => {
      const config = this.configs.get(i.configId)
      return config?.role === role
    })
  }

  getInstancesWithCapability(capability: AgentCapability): AgentInstance[] {
    return this.getAllInstances().filter(i => {
      const config = this.configs.get(i.configId)
      return config?.capabilities.includes(capability)
    })
  }

  getInstancesBySkill(skillId: string): AgentInstance[] {
    return this.getAllInstances().filter(i => i.skillId === skillId)
  }

  getAvailableInstances(): AgentInstance[] {
    return this.getAllInstances().filter(i => {
      if (i.status !== AgentInstanceStatus.Idle) return false
      const config = this.configs.get(i.configId)
      if (!config) return false
      const activeTasks = this.getInstancesByConfig(i.configId).filter(
        inst => inst.status === AgentInstanceStatus.Busy,
      ).length
      return activeTasks < config.maxConcurrentTasks
    })
  }

  updateInstanceStatus(instanceId: string, status: AgentInstanceStatus): boolean {
    const instance = this.instances.get(instanceId)
    if (!instance) return false

    instance.status = status
    instance.lastActiveAt = Date.now()
    return true
  }

  assignTaskToInstance(instanceId: string, taskId: string): boolean {
    const instance = this.instances.get(instanceId)
    if (!instance) return false
    if (instance.status !== AgentInstanceStatus.Idle) return false

    instance.status = AgentInstanceStatus.Busy
    instance.currentTaskId = taskId
    instance.lastActiveAt = Date.now()
    return true
  }

  completeTaskForInstance(instanceId: string, success: boolean): boolean {
    const instance = this.instances.get(instanceId)
    if (!instance) return false

    instance.status = AgentInstanceStatus.Idle
    instance.currentTaskId = null
    instance.lastActiveAt = Date.now()

    if (success) {
      instance.completedTaskCount++
    } else {
      instance.failedTaskCount++
    }

    return true
  }

  getInstanceConfig(instanceId: string): AgentConfig | undefined {
    const instance = this.instances.get(instanceId)
    if (!instance) return undefined
    return this.configs.get(instance.configId)
  }

  getRegistryStats(): {
    totalConfigs: number
    totalInstances: number
    idleInstances: number
    busyInstances: number
    errorInstances: number
    offlineInstances: number
  } {
    const instances = this.getAllInstances()
    return {
      totalConfigs: this.configs.size,
      totalInstances: instances.length,
      idleInstances: instances.filter(i => i.status === AgentInstanceStatus.Idle).length,
      busyInstances: instances.filter(i => i.status === AgentInstanceStatus.Busy).length,
      errorInstances: instances.filter(i => i.status === AgentInstanceStatus.Error).length,
      offlineInstances: instances.filter(i => i.status === AgentInstanceStatus.Offline).length,
    }
  }

  cleanupOfflineInstances(): number {
    const offlineInstances = this.getInstancesByStatus(AgentInstanceStatus.Offline)
    offlineInstances.forEach(i => this.instances.delete(i.id))
    return offlineInstances.length
  }

  exportRegistry(): { configs: AgentConfig[]; instances: AgentInstance[] } {
    return {
      configs: this.getAllConfigs(),
      instances: this.getAllInstances(),
    }
  }

  importRegistry(data: { configs: AgentConfig[]; instances: AgentInstance[] }): void {
    data.configs.forEach(c => this.configs.set(c.id, c))
    data.instances.forEach(i => this.instances.set(i.id, i))
  }
}