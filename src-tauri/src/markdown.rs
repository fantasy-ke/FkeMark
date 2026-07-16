/// Markdown处理模块
/// 提供markdown解析和转换功能

use serde_json::{Value, json};

/// 将markdown文本解析为TipTap兼容的JSON格式
#[allow(dead_code)]
pub fn parse_to_tiptap(markdown: &str) -> Value {
    let lines: Vec<&str> = markdown.lines().collect();
    let mut content = Vec::new();
    
    for line in lines {
        let line = line.trim_end();
        
        if line.is_empty() {
            content.push(json!({
                "type": "paragraph"
            }));
        } else if line.starts_with("### ") {
            content.push(json!({
                "type": "heading",
                "attrs": { "level": 3 },
                "content": [{ "type": "text", "text": &line[4..] }]
            }));
        } else if line.starts_with("## ") {
            content.push(json!({
                "type": "heading",
                "attrs": { "level": 2 },
                "content": [{ "type": "text", "text": &line[3..] }]
            }));
        } else if line.starts_with("# ") {
            content.push(json!({
                "type": "heading",
                "attrs": { "level": 1 },
                "content": [{ "type": "text", "text": &line[2..] }]
            }));
        } else if line.starts_with("- ") || line.starts_with("* ") {
            content.push(json!({
                "type": "bulletList",
                "content": [{
                    "type": "listItem",
                    "content": [{
                        "type": "paragraph",
                        "content": [{ "type": "text", "text": &line[2..] }]
                    }]
                }]
            }));
        } else if let Some((before, after)) = line.split_once(':') {
            if before.chars().all(|c| c.is_ascii_digit()) {
                // 有序列表
                content.push(json!({
                    "type": "orderedList",
                    "content": [{
                        "type": "listItem",
                        "content": [{
                            "type": "paragraph",
                            "content": [{ "type": "text", "text": after.trim_start() }]
                        }]
                    }]
                }));
            } else {
                content.push(json!({
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": line }]
                }));
            }
        } else {
            content.push(json!({
                "type": "paragraph",
                "content": [{ "type": "text", "text": line }]
            }));
        }
    }
    
    json!({
        "type": "doc",
        "content": content
    })
}

/// 将TipTap JSON转换为markdown文本
#[allow(dead_code)]
pub fn convert_to_markdown(json: &Value) -> String {
    let mut markdown = String::new();
    
    if let Some(content) = json["content"].as_array() {
        for (_i, node) in content.iter().enumerate() {
            match node["type"].as_str() {
                Some("heading") => {
                    let level = node["attrs"]["level"].as_u64().unwrap_or(1);
                    let text = node["content"][0]["text"].as_str().unwrap_or("");
                    markdown.push_str(&"#".repeat(level as usize));
                    markdown.push_str(" ");
                    markdown.push_str(text);
                    markdown.push_str("\n\n");
                },
                Some("paragraph") => {
                    if let Some(text) = node["content"][0]["text"].as_str() {
                        if !text.is_empty() {
                            markdown.push_str(text);
                            markdown.push_str("\n\n");
                        }
                    }
                },
                Some("bulletList") => {
                    for item in node["content"].as_array().unwrap_or(&vec![]) {
                        let text = item["content"][0]["content"][0]["text"].as_str().unwrap_or("");
                        markdown.push_str("- ");
                        markdown.push_str(text);
                        markdown.push_str("\n");
                    }
                    markdown.push_str("\n");
                },
                Some("orderedList") => {
                    for (idx, item) in node["content"].as_array().unwrap_or(&vec![]).iter().enumerate() {
                        let text = item["content"][0]["content"][0]["text"].as_str().unwrap_or("");
                        markdown.push_str(&(idx + 1).to_string());
                        markdown.push_str(". ");
                        markdown.push_str(text);
                        markdown.push_str("\n");
                    }
                    markdown.push_str("\n");
                },
                _ => {}
            }
        }
    }
    
    markdown.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_heading_parsing() {
        let markdown = "# 标题\n内容";
        let json = parse_to_tiptap(markdown);
        assert_eq!(json["type"], "doc");
        assert!(json["content"].as_array().unwrap().len() > 0);
    }
    
    #[test]
    fn test_markdown_conversion() {
        let json = json!({
            "type": "doc",
            "content": [{
                "type": "heading",
                "attrs": { "level": 1 },
                "content": [{ "type": "text", "text": "标题" }]
            }]
        });
        
        let markdown = convert_to_markdown(&json);
        assert!(markdown.contains("# 标题"));
    }
}