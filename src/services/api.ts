import { invoke } from '@tauri-apps/api/core';
import { StiFileInfo, StiImageData, StiMetadata, DirectoryContents } from '../types/sti';

export class StiApi {
  static async openStiFile(filePath: string): Promise<StiFileInfo> {
    return await invoke('open_sti_file', { filePath });
  }

  static async getStiImage(filePath: string, imageIndex: number): Promise<StiImageData> {
    return await invoke('get_sti_image', { filePath, imageIndex });
  }

  static async getStiMetadata(filePath: string): Promise<StiMetadata> {
    return await invoke('get_sti_metadata', { filePath });
  }

  static async saveStiFile(filePath: string, stiData: any): Promise<void> {
    return await invoke('save_sti_file', { filePath, stiData });
  }

  static async exportImage(
    filePath: string,
    imageIndex: number,
    outputPath: string,
    format: string
  ): Promise<void> {
    return await invoke('export_image', { filePath, imageIndex, outputPath, format });
  }
}

export class DirectoryApi {
  static async selectDirectory(): Promise<string | null> {
    return await invoke('select_directory');
  }

  static async browseDirectory(directoryPath: string): Promise<DirectoryContents> {
    return await invoke('browse_directory', { directoryPath });
  }

  static async scanForStiFiles(directoryPath: string, recursive: boolean = true): Promise<string[]> {
    return await invoke('scan_for_sti_files', { directoryPath, recursive });
  }

  static async clearStiCache(): Promise<void> {
    return await invoke('clear_sti_cache');
  }
}

export class FileSystem {
  // Placeholder for file system operations
  // In a real implementation, these would use Tauri's file system APIs
  static async openFileDialog(): Promise<string | null> {
    // This would use Tauri's dialog plugin
    // For now, return a placeholder
    return null;
  }

  static async saveFileDialog(): Promise<string | null> {
    // This would use Tauri's dialog plugin
    return null;
  }
}