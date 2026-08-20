import React from 'react'
import type { ProjectDetail } from '../types'
import { styles } from '../OfficeScene.styles'

interface FilesTabProps {
  projectDetail?: ProjectDetail | null
}

export default function FilesTab({ projectDetail }: FilesTabProps) {
  return (
    <div>
      <div style={styles.sectionTitle}>项目文件</div>
      {projectDetail?.execution_logs && projectDetail.execution_logs.length > 0 ? (
        projectDetail.execution_logs
          .filter(log => log.type === 'file_write' || log.type === 'iteration')
          .slice(0, 10)
          .map((log, i) => (
            <div key={i} style={styles.fileItem}>
              <span style={styles.fileIcon}>📄</span>
              <div style={styles.fileInfo}>
                <div style={styles.fileName}>{String(log.file || log.task_id || '未知文件')}</div>
                <div style={styles.fileMeta}>{String(log.type)}</div>
              </div>
            </div>
          ))
      ) : (
        <div style={styles.emptyState}>暂无文件记录</div>
      )}
    </div>
  )
}
