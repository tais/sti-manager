use std::io::{Read, Seek, SeekFrom, Cursor, Write};
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use crate::sti::types::*;
use crate::sti::etrle::EtrleDecoder;

pub struct StiParser;

impl StiParser {
    /// Parse an STI file from bytes
    pub fn parse(data: &[u8]) -> StiResult<StiFile> {
        let mut cursor = Cursor::new(data);
        let header = Self::parse_header(&mut cursor)?;
        
        let mut sti_file = StiFile::new();
        sti_file.header = header;
        
        if sti_file.is_8bit() {
            Self::parse_8bit_file(&mut cursor, &mut sti_file)?;
        } else if sti_file.is_16bit() {
            Self::parse_16bit_file(&mut cursor, &mut sti_file)?;
        } else {
            return Err(StiError::UnsupportedFormat(
                "Unknown STI format - neither 8-bit nor 16-bit".to_string()
            ));
        }
        
        Ok(sti_file)
    }
    
    /// Parse the 64-byte STI header
    fn parse_header(cursor: &mut Cursor<&[u8]>) -> StiResult<StiHeader> {
        let mut header = StiHeader::default();
        
        // Read signature (bytes 1-4)
        cursor.read_exact(&mut header.signature)?;
        if &header.signature != b"STCI" {
            return Err(StiError::InvalidFormat(
                "Invalid STI signature".to_string()
            ));
        }
        
        // Read basic header fields (bytes 5-24)
        header.original_size = cursor.read_u32::<LittleEndian>()?;
        header.compressed_size = cursor.read_u32::<LittleEndian>()?;
        header.transparent_color = cursor.read_u32::<LittleEndian>()?;
        
        let flags_value = cursor.read_u32::<LittleEndian>()?;
        header.flags = StiFlags::from(flags_value);
        
        // Width and height are only used for 16-bit files
        if header.flags.rgb && !header.flags.indexed {
            // 16-bit file format
            header.height = cursor.read_u16::<LittleEndian>()?;
            header.width = cursor.read_u16::<LittleEndian>()?;
            
            // Read color masks and depths (bytes 25-44)
            header.red_mask = cursor.read_u32::<LittleEndian>()?;
            header.green_mask = cursor.read_u32::<LittleEndian>()?;
            header.blue_mask = cursor.read_u32::<LittleEndian>()?;
            header.alpha_mask = cursor.read_u32::<LittleEndian>()?;
            header.red_depth = cursor.read_u8()?;
            header.green_depth = cursor.read_u8()?;
            header.blue_depth = cursor.read_u8()?;
            header.alpha_depth = cursor.read_u8()?;
        } else if header.flags.indexed && !header.flags.rgb {
            // 8-bit file format - width/height are NOT in main header
            header.height = 0; // Will be set from sub-image headers
            header.width = 0;  // Will be set from sub-image headers
            
            // Skip to byte 25 for 8-bit specific data
            cursor.seek(SeekFrom::Current(4))?; // Skip bytes 21-24
            
            header.palette_colors = cursor.read_u32::<LittleEndian>()?;
            header.num_images = cursor.read_u16::<LittleEndian>()?;
            header.red_depth = cursor.read_u8()?;
            header.green_depth = cursor.read_u8()?;
            header.blue_depth = cursor.read_u8()?;
            
            // Skip unused bytes (bytes 34-44)
            cursor.seek(SeekFrom::Current(11))?;
        } else {
            return Err(StiError::InvalidFormat(
                "Invalid STI format flags - must be either RGB or indexed".to_string()
            ));
        }
        
        // Read remaining header fields (bytes 45-64)
        header.color_depth = cursor.read_u8()?;
        header.app_data_size = cursor.read_u32::<LittleEndian>()?;
        
        // Skip remaining unused bytes to reach byte 64
        cursor.seek(SeekFrom::Start(64))?;
        
        Ok(header)
    }
    
    /// Parse 8-bit indexed STI file
    fn parse_8bit_file(cursor: &mut Cursor<&[u8]>, sti_file: &mut StiFile) -> StiResult<()> {
        // Read palette (768 bytes = 256 colors * 3 bytes)
        let mut palette = [[0u8; 3]; 256];
        for i in 0..256 {
            cursor.read_exact(&mut palette[i])?;
        }
        sti_file.palette = Some(palette);
        
        // Read sub-image headers
        let num_images = sti_file.header.num_images as usize;
        let mut sub_headers = Vec::with_capacity(num_images);
        
        for _ in 0..num_images {
            let sub_header = Self::parse_sub_image_header(cursor)?;
            sub_headers.push(sub_header);
        }
        
        // Read image data
        for sub_header in sub_headers {
            let mut image = StiImage::with_header(sub_header.clone());
            
            // Read raw compressed data
            image.raw_data = vec![0u8; sub_header.data_size as usize];
            cursor.read_exact(&mut image.raw_data)?;
            
            // Decompress if using ETRLE
            if sti_file.header.flags.etrle_compressed {
                let decoder = EtrleDecoder::new(sub_header.width, sub_header.height);
                image.decompressed_data = Some(decoder.decompress(&image.raw_data)?);
            }
            
            sti_file.images.push(image);
        }
        
        // Read animation data if present
        if sti_file.header.app_data_size > 0 {
            let animation_count = (sti_file.header.app_data_size / 16) as usize;
            for _ in 0..animation_count {
                let mut anim_data = StiAnimationData {
                    unknown1: [0; 8],
                    frame_count: 0,
                    unknown2: 0,
                    unknown3: [0; 6],
                };
                
                cursor.read_exact(&mut anim_data.unknown1)?;
                anim_data.frame_count = cursor.read_u8()?;
                anim_data.unknown2 = cursor.read_u8()?;
                cursor.read_exact(&mut anim_data.unknown3)?;
                
                sti_file.animation_data.push(anim_data);
            }
        }
        
        Ok(())
    }
    
    /// Parse 16-bit RGB STI file
    fn parse_16bit_file(cursor: &mut Cursor<&[u8]>, sti_file: &mut StiFile) -> StiResult<()> {
        let width = sti_file.header.width;
        let height = sti_file.header.height;
        let data_size = (width as usize) * (height as usize) * 2; // 2 bytes per pixel
        
        let mut image = StiImage::new(width, height);
        image.raw_data = vec![0u8; data_size];
        cursor.read_exact(&mut image.raw_data)?;
        
        // For 16-bit images, the raw data is already decompressed
        image.decompressed_data = Some(image.raw_data.clone());
        
        sti_file.images.push(image);
        Ok(())
    }
    
    /// Parse sub-image header (16 bytes)
    fn parse_sub_image_header(cursor: &mut Cursor<&[u8]>) -> StiResult<StiSubImageHeader> {
        Ok(StiSubImageHeader {
            data_offset: cursor.read_u32::<LittleEndian>()?,
            data_size: cursor.read_u32::<LittleEndian>()?,
            offset_x: cursor.read_i16::<LittleEndian>()?,
            offset_y: cursor.read_i16::<LittleEndian>()?,
            height: cursor.read_u16::<LittleEndian>()?,
            width: cursor.read_u16::<LittleEndian>()?,
        })
    }
    
    /// Convert STI file to bytes for saving
    pub fn write(sti_file: &StiFile) -> StiResult<Vec<u8>> {
        let mut data = Vec::new();
        let mut cursor = Cursor::new(&mut data);
        
        Self::write_header(&mut cursor, &sti_file.header)?;
        
        if sti_file.is_8bit() {
            Self::write_8bit_file(&mut cursor, sti_file)?;
        } else if sti_file.is_16bit() {
            Self::write_16bit_file(&mut cursor, sti_file)?;
        } else {
            return Err(StiError::UnsupportedFormat(
                "Unknown STI format for writing".to_string()
            ));
        }
        
        Ok(data)
    }
    
    /// Write STI header to bytes
    fn write_header(cursor: &mut Cursor<&mut Vec<u8>>, header: &StiHeader) -> StiResult<()> {
        // Write signature
        cursor.write_all(&header.signature)?;
        
        // Write basic fields
        cursor.write_u32::<LittleEndian>(header.original_size)?;
        cursor.write_u32::<LittleEndian>(header.compressed_size)?;
        cursor.write_u32::<LittleEndian>(header.transparent_color)?;
        cursor.write_u32::<LittleEndian>(header.flags.into())?;
        cursor.write_u16::<LittleEndian>(header.height)?;
        cursor.write_u16::<LittleEndian>(header.width)?;
        
        // Write format-specific data
        if header.flags.rgb {
            cursor.write_u32::<LittleEndian>(header.red_mask)?;
            cursor.write_u32::<LittleEndian>(header.green_mask)?;
            cursor.write_u32::<LittleEndian>(header.blue_mask)?;
            cursor.write_u32::<LittleEndian>(header.alpha_mask)?;
            cursor.write_u8(header.red_depth)?;
            cursor.write_u8(header.green_depth)?;
            cursor.write_u8(header.blue_depth)?;
            cursor.write_u8(header.alpha_depth)?;
        } else if header.flags.indexed {
            cursor.write_u32::<LittleEndian>(header.palette_colors)?;
            cursor.write_u16::<LittleEndian>(header.num_images)?;
            cursor.write_u8(header.red_depth)?;
            cursor.write_u8(header.green_depth)?;
            cursor.write_u8(header.blue_depth)?;
            
            // Write padding to byte 44
            for _ in 0..11 {
                cursor.write_u8(0)?;
            }
        }
        
        // Write remaining fields
        cursor.write_u8(header.color_depth)?;
        cursor.write_u32::<LittleEndian>(header.app_data_size)?;
        
        // Pad to 64 bytes
        let current_pos = cursor.position() as usize;
        for _ in current_pos..64 {
            cursor.write_u8(0)?;
        }
        
        Ok(())
    }
    
    fn write_8bit_file(cursor: &mut Cursor<&mut Vec<u8>>, sti_file: &StiFile) -> StiResult<()> {
        // Write palette
        if let Some(palette) = &sti_file.palette {
            for color in palette.iter() {
                cursor.write_all(color)?;
            }
        } else {
            return Err(StiError::InvalidFormat(
                "8-bit STI file requires palette".to_string()
            ));
        }
        
        // Write sub-image headers
        for image in &sti_file.images {
            if let Some(header) = &image.header {
                Self::write_sub_image_header(cursor, header)?;
            } else {
                return Err(StiError::InvalidFormat(
                    "8-bit STI images require sub-image headers".to_string()
                ));
            }
        }
        
        // Write image data
        for image in &sti_file.images {
            cursor.write_all(&image.raw_data)?;
        }
        
        // Write animation data
        for anim_data in &sti_file.animation_data {
            cursor.write_all(&anim_data.unknown1)?;
            cursor.write_u8(anim_data.frame_count)?;
            cursor.write_u8(anim_data.unknown2)?;
            cursor.write_all(&anim_data.unknown3)?;
        }
        
        Ok(())
    }
    
    fn write_16bit_file(cursor: &mut Cursor<&mut Vec<u8>>, sti_file: &StiFile) -> StiResult<()> {
        if let Some(image) = sti_file.images.first() {
            cursor.write_all(&image.raw_data)?;
        } else {
            return Err(StiError::InvalidFormat(
                "16-bit STI file requires at least one image".to_string()
            ));
        }
        Ok(())
    }
    
    fn write_sub_image_header(cursor: &mut Cursor<&mut Vec<u8>>, header: &StiSubImageHeader) -> StiResult<()> {
        cursor.write_u32::<LittleEndian>(header.data_offset)?;
        cursor.write_u32::<LittleEndian>(header.data_size)?;
        cursor.write_i16::<LittleEndian>(header.offset_x)?;
        cursor.write_i16::<LittleEndian>(header.offset_y)?;
        cursor.write_u16::<LittleEndian>(header.height)?;
        cursor.write_u16::<LittleEndian>(header.width)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    
    #[test]
    fn test_header_parsing() {
        // Create a minimal valid STI header
        let mut header_data = vec![0u8; 64];
        header_data[0..4].copy_from_slice(b"STCI");
        
        // Set flags for 8-bit indexed format (bit 4 and 6 set)
        header_data[16] = 0x28; // 40 in decimal = 0x28 = bits 3 and 5 set
        
        let mut cursor = Cursor::new(header_data.as_slice());
        let header = StiParser::parse_header(&mut cursor).unwrap();
        
        assert_eq!(header.signature, [b'S', b'T', b'C', b'I']);
        assert_eq!(header.flags.indexed, true);
    }
    
    #[test]
    fn test_cryo_corpse_file() {
        // Test the specific file that's failing
        let file_path = "../CRYO_CORPSE.STI";
        
        if let Ok(file_data) = fs::read(file_path) {
            println!("File size: {} bytes", file_data.len());
            
            // Test header parsing
            let mut cursor = Cursor::new(file_data.as_slice());
            match StiParser::parse_header(&mut cursor) {
                Ok(header) => {
                    println!("Header parsed successfully!");
                    println!("Flags: 0x{:08X}", Into::<u32>::into(header.flags));
                    println!("Is 8-bit: {}", header.flags.indexed && !header.flags.rgb);
                    println!("Is 16-bit: {}", header.flags.rgb && !header.flags.indexed);
                    println!("ETRLE compressed: {}", header.flags.etrle_compressed);
                    println!("Num images: {}", header.num_images);
                    println!("Palette colors: {}", header.palette_colors);
                    println!("Width: {}, Height: {}", header.width, header.height);
                }
                Err(e) => {
                    println!("Header parsing failed: {}", e);
                }
            }
            
            // Test full parsing
            match StiParser::parse(&file_data) {
                Ok(sti_file) => {
                    println!("Full parsing successful! Images: {}", sti_file.images.len());
                }
                Err(e) => {
                    println!("Full parsing failed: {}", e);
                }
            }
        } else {
            println!("Could not read CRYO_CORPSE.STI file");
        }
    }
}