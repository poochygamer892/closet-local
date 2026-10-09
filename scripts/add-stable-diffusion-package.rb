require 'xcodeproj'

project_path = ARGV.fetch(0)
target_name = ARGV.fetch(1, 'ClosetLocal')
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |item| item.name == target_name }
abort "#{target_name} target not found" unless target
target.build_configurations.each { |configuration| configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.2' }

url = 'https://github.com/apple/ml-stable-diffusion.git'
package = project.root_object.package_references.find { |item| item.respond_to?(:repositoryURL) && item.repositoryURL == url }
unless package
  package = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
  package.repositoryURL = url
  package.requirement = { 'kind' => 'upToNextMajorVersion', 'minimumVersion' => '1.0.0' }
  project.root_object.package_references << package
end

product = target.package_product_dependencies.find { |item| item.product_name == 'StableDiffusion' }
unless product
  product = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
  product.product_name = 'StableDiffusion'
  product.package = package
  target.package_product_dependencies << product
  build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
  build_file.product_ref = product
  target.frameworks_build_phase.files << build_file
end
project.save
