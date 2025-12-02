SELECT id, provider, api_model_name, layer, enabled, priority 
FROM model_configs 
ORDER BY layer, priority;