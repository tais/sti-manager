use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum StiError {
    #[error("Invalid STI file format: {0}")]
    InvalidFormat(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Decompression error: {0}")]
    Decompression(String),
    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),
}

pub type StiResult<T> = Result<T, StiError>;

/// STI file format flags
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct StiFlags {
    pub transparent: bool,      // bit 1
    pub alpha: bool,           // bit 2
    pub rgb: bool,             // bit 3 - 16-bit file
    pub indexed: bool,         // bit 4 - 8-bit file
    pub zlib_compressed: bool, // bit 5
    pub etrle_compressed: bool, // bit 6
}

impl From<u32> for StiFlags {
    fn from(flags: u32) -> Self {
        Self {
            transparent: (flags & 0x01) != 0,
            alpha: (flags & 0x02) != 0,
            rgb: (flags & 0x04) != 0,
            indexed: (flags & 0x08) != 0,
            zlib_compressed: (flags & 0x10) != 0,
            etrle_compressed: (flags & 0x20) != 0,
        }
    }
}

impl Into<u32> for StiFlags {
    fn into(self) -> u32 {
        let mut flags = 0u32;
        if self.transparent { flags |= 0x01; }
        if self.alpha { flags |= 0x02; }
        if self.rgb { flags |= 0x04; }
        if self.indexed { flags |= 0x08; }
        if self.zlib_compressed { flags |= 0x10; }
        if self.etrle_compressed { flags |= 0x20; }
        flags
    }
}

/// Main STI file header (64 bytes)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StiHeader {
    pub signature: [u8; 4],           // "STCI"
    pub original_size: u32,           // Original image size in bytes
    pub compressed_size: u32,         // Compressed size in bytes
    pub transparent_color: u32,       // Transparent color index (8-bit only)
    pub flags: StiFlags,              // Format flags
    pub height: u16,                  // Image height (16-bit only)
    pub width: u16,                   // Image width (16-bit only)
    
    // Color masks and depths for 16-bit files
    pub red_mask: u32,
    pub green_mask: u32,
    pub blue_mask: u32,
    pub alpha_mask: u32,
    pub red_depth: u8,
    pub green_depth: u8,
    pub blue_depth: u8,
    pub alpha_depth: u8,
    
    // 8-bit file specific fields
    pub palette_colors: u32,          // Number of colors in palette (usually 256)
    pub num_images: u16,              // Number of images in file
    
    // Additional fields
    pub color_depth: u8,              // Bits per pixel (8 or 16)
    pub app_data_size: u32,           // Size of application data for animated files
}

impl Default for StiHeader {
    fn default() -> Self {
        Self {
            signature: [b'S', b'T', b'C', b'I'],
            original_size: 0,
            compressed_size: 0,
            transparent_color: 0,
            flags: StiFlags {
                transparent: false,
                alpha: false,
                rgb: false,
                indexed: false,
                zlib_compressed: false,
                etrle_compressed: false,
            },
            height: 0,
            width: 0,
            red_mask: 0,
            green_mask: 0,
            blue_mask: 0,
            alpha_mask: 0,
            red_depth: 0,
            green_depth: 0,
            blue_depth: 0,
            alpha_depth: 0,
            palette_colors: 0,
            num_images: 0,
            color_depth: 0,
            app_data_size: 0,
        }
    }
}

/// Sub-image header for 8-bit multi-image files (16 bytes each)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StiSubImageHeader {
    pub data_offset: u32,             // Offset from previous image data start
    pub data_size: u32,               // Size of this image's data in bytes
    pub offset_x: i16,                // Horizontal offset in pixels
    pub offset_y: i16,                // Vertical offset in pixels
    pub height: u16,                  // Image height in pixels
    pub width: u16,                   // Image width in pixels
}

/// Animation data for animated STI files (16 bytes per image)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StiAnimationData {
    pub unknown1: [u8; 8],            // Unknown purpose, usually 0
    pub frame_count: u8,              // Number of frames in this direction (first frame only)
    pub unknown2: u8,                 // Unknown purpose, usually 2 for first frame
    pub unknown3: [u8; 6],            // Unknown purpose, usually 0
}

/// Color palette for 8-bit images (256 colors * 3 bytes = 768 bytes)
pub type StiPalette = [[u8; 3]; 256];

/// Complete STI file data structure
#[derive(Debug, Clone)]
pub struct StiFile {
    pub header: StiHeader,
    pub palette: Option<StiPalette>,
    pub images: Vec<StiImage>,
    pub animation_data: Vec<StiAnimationData>,
}

/// Individual image within an STI file
#[derive(Debug, Clone)]
pub struct StiImage {
    pub header: Option<StiSubImageHeader>, // None for 16-bit files
    pub raw_data: Vec<u8>,                 // Raw compressed data
    pub decompressed_data: Option<Vec<u8>>, // Decompressed pixel data
    pub width: u16,
    pub height: u16,
}

impl StiImage {
    pub fn new(width: u16, height: u16) -> Self {
        Self {
            header: None,
            raw_data: Vec::new(),
            decompressed_data: None,
            width,
            height,
        }
    }
    
    pub fn with_header(header: StiSubImageHeader) -> Self {
        Self {
            width: header.width,
            height: header.height,
            header: Some(header),
            raw_data: Vec::new(),
            decompressed_data: None,
        }
    }
}

impl StiFile {
    pub fn new() -> Self {
        Self {
            header: StiHeader::default(),
            palette: None,
            images: Vec::new(),
            animation_data: Vec::new(),
        }
    }
    
    pub fn is_16bit(&self) -> bool {
        self.header.flags.rgb && !self.header.flags.indexed
    }
    
    pub fn is_8bit(&self) -> bool {
        self.header.flags.indexed && !self.header.flags.rgb
    }
    
    pub fn is_animated(&self) -> bool {
        self.header.num_images > 1
    }
    
    pub fn is_compressed(&self) -> bool {
        self.header.flags.etrle_compressed || self.header.flags.zlib_compressed
    }
}