export interface StiFileInfo {
  width: number;
  height: number;
  num_images: number;
  is_16bit: boolean;
  is_8bit: boolean;
  is_animated: boolean;
  is_compressed: boolean;
  file_size: number;
}

export interface StiImageData {
  width: number;
  height: number;
  data: number[];
  palette?: number[][];
}

export interface StiMetadata {
  signature: number[];
  original_size: number;
  compressed_size: number;
  transparent_color: number;
  flags: {
    transparent: boolean;
    alpha: boolean;
    rgb: boolean;
    indexed: boolean;
    zlib_compressed: boolean;
    etrle_compressed: boolean;
  };
  height: number;
  width: number;
  red_mask: number;
  green_mask: number;
  blue_mask: number;
  alpha_mask: number;
  red_depth: number;
  green_depth: number;
  blue_depth: number;
  alpha_depth: number;
  palette_colors: number;
  num_images: number;
  color_depth: number;
  app_data_size: number;
}

export interface DirectoryItem {
  name: string;
  path: string;
  is_directory: boolean;
  size?: number;
  modified?: string;
  is_sti_file: boolean;
}

export interface DirectoryContents {
  current_path: string;
  parent_path?: string;
  items: DirectoryItem[];
  sti_count: number;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: Date;
}