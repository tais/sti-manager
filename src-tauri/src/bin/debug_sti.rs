use std::env;
use std::fs;
use std::path::Path;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 2 {
        eprintln!("Usage: {} <sti_file>", args[0]);
        std::process::exit(1);
    }
    
    let file_path = &args[1];
    let path = Path::new(file_path);
    
    if !path.exists() {
        eprintln!("File does not exist: {}", file_path);
        std::process::exit(1);
    }
    
    let file_data = match fs::read(path) {
        Ok(data) => data,
        Err(e) => {
            eprintln!("Failed to read file: {}", e);
            std::process::exit(1);
        }
    };
    
    if file_data.len() < 64 {
        eprintln!("File too small: {} bytes (need at least 64 for header)", file_data.len());
        std::process::exit(1);
    }
    
    // Read main header (first 64 bytes)
    let signature = &file_data[0..4];
    let original_size = u32::from_le_bytes([file_data[4], file_data[5], file_data[6], file_data[7]]);
    let compressed_size = u32::from_le_bytes([file_data[8], file_data[9], file_data[10], file_data[11]]);
    let transparent_color = u32::from_le_bytes([file_data[12], file_data[13], file_data[14], file_data[15]]);
    let flags_value = u32::from_le_bytes([file_data[16], file_data[17], file_data[18], file_data[19]]);
    let height = u16::from_le_bytes([file_data[20], file_data[21]]);
    let width = u16::from_le_bytes([file_data[22], file_data[23]]);
    let color_depth = u8::from_le_bytes([file_data[24]]);
    let num_images = u16::from_le_bytes([file_data[26], file_data[27]]);
    let palette_colors = u16::from_le_bytes([file_data[30], file_data[31]]);
    
    println!("STI File Analysis: {}", file_path);
    println!("=================");
    println!("File size: {} bytes", file_data.len());
    println!("Signature: {:?} ({})", signature, String::from_utf8_lossy(signature));
    println!("Original size: {}", original_size);
    println!("Compressed size: {}", compressed_size);
    println!("Transparent color: {}", transparent_color);
    println!("Flags: 0x{:08X}", flags_value);
    println!("Height: {}", height);
    println!("Width: {}", width);
    println!("Color depth: {}", color_depth);
    println!("Num images: {}", num_images);
    println!("Palette colors: {}", palette_colors);
    
    // Analyze flags
    let transparent = (flags_value & 0x01) != 0;
    let alpha = (flags_value & 0x02) != 0;
    let rgb = (flags_value & 0x04) != 0;
    let indexed = (flags_value & 0x08) != 0;
    let zlib_compressed = (flags_value & 0x10) != 0;
    let etrle_compressed = (flags_value & 0x20) != 0;
    
    println!("\nFlags breakdown:");
    println!("- Transparent: {}", transparent);
    println!("- Alpha: {}", alpha);
    println!("- RGB: {}", rgb);
    println!("- Indexed: {}", indexed);
    println!("- ZLIB compressed: {}", zlib_compressed);
    println!("- ETRLE compressed: {}", etrle_compressed);
    
    // If this is an indexed (8-bit) file, analyze sub-image headers
    if indexed && num_images > 0 {
        println!("\nSub-image headers:");
        let mut offset = 64; // Start after main header
        
        // Skip palette (always 768 bytes for 8-bit files)
        offset += 768; // 256 colors * 3 bytes
        println!("Palette size: 256 colors (768 bytes)");
        
        for i in 0..num_images {
            if offset + 16 <= file_data.len() {
                let data_offset = u32::from_le_bytes([
                    file_data[offset],
                    file_data[offset + 1],
                    file_data[offset + 2],
                    file_data[offset + 3]
                ]);
                let data_size = u32::from_le_bytes([
                    file_data[offset + 4],
                    file_data[offset + 5],
                    file_data[offset + 6],
                    file_data[offset + 7]
                ]);
                let offset_x = i16::from_le_bytes([file_data[offset + 8], file_data[offset + 9]]);
                let offset_y = i16::from_le_bytes([file_data[offset + 10], file_data[offset + 11]]);
                let img_height = u16::from_le_bytes([file_data[offset + 12], file_data[offset + 13]]);
                let img_width = u16::from_le_bytes([file_data[offset + 14], file_data[offset + 15]]);
                
                println!("Image {}: data_offset={}, data_size={}, offset_x={}, offset_y={}, width={}, height={}",
                    i, data_offset, data_size, offset_x, offset_y, img_width, img_height);
                
                offset += 16;
            } else {
                println!("Image {}: Header extends beyond file boundary", i);
                break;
            }
        }
        
        println!("Image data starts at offset: {}", offset);
    }
    
    // Show first 128 bytes as hex for low-level analysis
    println!("\nFirst 128 bytes (hex):");
    for i in (0..std::cmp::min(128, file_data.len())).step_by(16) {
        print!("{:04X}: ", i);
        for j in 0..16 {
            if i + j < file_data.len() {
                print!("{:02X} ", file_data[i + j]);
            } else {
                print!("   ");
            }
        }
        print!(" ");
        for j in 0..16 {
            if i + j < file_data.len() {
                let c = file_data[i + j];
                if c >= 32 && c <= 126 {
                    print!("{}", c as char);
                } else {
                    print!(".");
                }
            }
        }
        println!();
    }
}