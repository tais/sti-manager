use crate::sti::types::{StiError, StiResult};

/// ETRLE (Extended Transparent Run-Length Encoding) decompression
/// 
/// The ETRLE algorithm works as follows:
/// - Each byte either represents transparent pixels or indicates non-transparent pixel count
/// - If the highest bit (bit 7) is 1: lower 7 bits = number of transparent pixels
/// - If the highest bit (bit 7) is 0: lower 7 bits = number of non-transparent pixels to follow
/// - Each row ends with a full zero byte (0x00)
pub struct EtrleDecoder {
    width: usize,
    height: usize,
}

impl EtrleDecoder {
    pub fn new(width: u16, height: u16) -> Self {
        Self {
            width: width as usize,
            height: height as usize,
        }
    }

    /// Decompress ETRLE compressed data
    pub fn decompress(&self, compressed_data: &[u8]) -> StiResult<Vec<u8>> {
        let mut decompressed = Vec::with_capacity(self.width * self.height);
        let mut input_pos = 0;
        let mut current_row = 0;
        let mut current_col = 0;

        while input_pos < compressed_data.len() && current_row < self.height {
            let control_byte = compressed_data[input_pos];
            input_pos += 1;

            if control_byte == 0x00 {
                // End of row marker
                // Fill remaining pixels in row with transparent (0)
                while current_col < self.width {
                    decompressed.push(0);
                    current_col += 1;
                }
                current_row += 1;
                current_col = 0;
                continue;
            }

            if (control_byte & 0x80) != 0 {
                // Transparent pixels: highest bit is 1
                let transparent_count = (control_byte & 0x7F) as usize;
                
                for _ in 0..transparent_count {
                    if current_col >= self.width {
                        return Err(StiError::Decompression(
                            "Transparent pixels exceed row width".to_string()
                        ));
                    }
                    decompressed.push(0); // Transparent color is 0
                    current_col += 1;
                }
            } else {
                // Non-transparent pixels: highest bit is 0
                let pixel_count = (control_byte & 0x7F) as usize;
                
                if input_pos + pixel_count > compressed_data.len() {
                    return Err(StiError::Decompression(
                        "Not enough data for non-transparent pixels".to_string()
                    ));
                }
                
                for i in 0..pixel_count {
                    if current_col >= self.width {
                        return Err(StiError::Decompression(
                            "Non-transparent pixels exceed row width".to_string()
                        ));
                    }
                    decompressed.push(compressed_data[input_pos + i]);
                    current_col += 1;
                }
                input_pos += pixel_count;
            }
        }

        // Ensure we have the expected amount of data
        let expected_size = self.width * self.height;
        if decompressed.len() != expected_size {
            // Pad with transparent pixels if needed
            decompressed.resize(expected_size, 0);
        }

        Ok(decompressed)
    }

    /// Compress pixel data using ETRLE algorithm
    pub fn compress(&self, pixel_data: &[u8]) -> StiResult<Vec<u8>> {
        if pixel_data.len() != self.width * self.height {
            return Err(StiError::InvalidFormat(
                "Pixel data size doesn't match image dimensions".to_string()
            ));
        }

        let mut compressed = Vec::new();
        
        for row in 0..self.height {
            let row_start = row * self.width;
            let row_end = row_start + self.width;
            let row_data = &pixel_data[row_start..row_end];
            
            self.compress_row(row_data, &mut compressed)?;
            
            // Add end-of-row marker
            compressed.push(0x00);
        }

        Ok(compressed)
    }

    fn compress_row(&self, row_data: &[u8], compressed: &mut Vec<u8>) -> StiResult<()> {
        let mut pos = 0;
        
        while pos < row_data.len() {
            if row_data[pos] == 0 {
                // Count consecutive transparent pixels
                let mut transparent_count = 0;
                while pos + transparent_count < row_data.len() && 
                      row_data[pos + transparent_count] == 0 && 
                      transparent_count < 127 {
                    transparent_count += 1;
                }
                
                // Write transparent pixel count with highest bit set
                compressed.push(0x80 | (transparent_count as u8));
                pos += transparent_count;
            } else {
                // Count consecutive non-transparent pixels
                let mut pixel_count = 0;
                while pos + pixel_count < row_data.len() && 
                      row_data[pos + pixel_count] != 0 && 
                      pixel_count < 127 {
                    pixel_count += 1;
                }
                
                // Write pixel count with highest bit clear
                compressed.push(pixel_count as u8);
                
                // Write the actual pixel data
                for i in 0..pixel_count {
                    compressed.push(row_data[pos + i]);
                }
                
                pos += pixel_count;
            }
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_etrle_simple_decompression() {
        let decoder = EtrleDecoder::new(4, 2);
        
        // Test data: 2 transparent, 2 non-transparent (values 1,2), end row
        //           1 transparent, 3 non-transparent (values 3,4,5), end row
        let compressed = vec![
            0x82, // 2 transparent pixels
            0x02, 1, 2, // 2 non-transparent pixels
            0x00, // end of row
            0x81, // 1 transparent pixel
            0x03, 3, 4, 5, // 3 non-transparent pixels
            0x00, // end of row
        ];
        
        let result = decoder.decompress(&compressed).unwrap();
        assert_eq!(result, vec![0, 0, 1, 2, 0, 3, 4, 5]);
    }

    #[test]
    fn test_etrle_compression() {
        let decoder = EtrleDecoder::new(4, 2);
        let pixel_data = vec![0, 0, 1, 2, 0, 3, 4, 5];
        
        let compressed = decoder.compress(&pixel_data).unwrap();
        let decompressed = decoder.decompress(&compressed).unwrap();
        
        assert_eq!(pixel_data, decompressed);
    }

    #[test]
    fn test_etrle_all_transparent() {
        let decoder = EtrleDecoder::new(3, 1);
        let compressed = vec![0x83, 0x00]; // 3 transparent pixels, end row
        
        let result = decoder.decompress(&compressed).unwrap();
        assert_eq!(result, vec![0, 0, 0]);
    }

    #[test]
    fn test_etrle_no_transparent() {
        let decoder = EtrleDecoder::new(3, 1);
        let compressed = vec![0x03, 1, 2, 3, 0x00]; // 3 non-transparent pixels, end row
        
        let result = decoder.decompress(&compressed).unwrap();
        assert_eq!(result, vec![1, 2, 3]);
    }
}