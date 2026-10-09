require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ClosetLocalAI'
  s.version        = package['version']
  s.summary        = 'On-device Vision helpers for Closet Local'
  s.description    = 'Foreground extraction and image labels that run entirely on an iPhone.'
  s.author         = 'Closet Local'
  s.homepage       = 'https://github.com/pedrotobiasbleda/closet-local-ios.'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://example.invalid/closet-local-ai.git', :tag => s.version.to_s }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
end
