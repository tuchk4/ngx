import camelCase from 'lodash/string/camelCase';
import isObject from 'lodash/lang/isObject';
import isString from 'lodash/lang/isString';
import isFunction from 'lodash/lang/isFunction';
import isArray from 'lodash/lang/isArray';

import Logger from '../../utils/logger';
import Injector from '../services/injector';
import Compiler from '../services/compiler';

import DirectiveParams from '../services/directive-params';
import Scope from '../services/scope';


let initController = ($scope, $attrs, $element, componentModel) => {
  let instances = [];
  let directiveParams = new DirectiveParams($scope, $attrs, $element, componentModel);

  if (componentModel.hasInterfaces()) {
    // gather interfaces
    let interfaces = componentModel.getInterfaces();

    for (let key of Object.keys(interfaces)) {
      let instance = directiveParams.parse(key);

      if (!instance) {
        throw Error(`directive should implements interface "${key}"`);
      }

      let InterfaceClass = interfaces[key];

      if (!(instance instanceof InterfaceClass)) {
        throw Error(`interface "${key}" has wrong class`);
      }

      instances.push(instance);
    }
  }


  if (componentModel.hasOptions()) {
    // gather options
    let options = componentModel.getOptions();

    for (let key of Object.keys(options)) {
      let interfaceInstance = directiveParams.parse(key);

      let instance = null;
      if (interfaceInstance) {

        let InterfaceClass = options[key];

        if (!(interfaceInstance instanceof InterfaceClass)) {
          throw Error(`interface "${key}" has wrong class`);
        }

        instance = $scope[key];
      }

      instances.push(instance);
    }
  }

  let Controller = componentModel.getController();
  let name = componentModel.getName();

  let logger = Logger.create(name);

  let controller = new Controller(...instances, directiveParams, logger);

  Scope.attach(controller, $scope);

  if (componentModel.isIsolated()) {
    let namespace = componentModel.getNamespace();
    $scope[namespace] = controller;
  }

  // $scope events
  $scope.$on('$destroy', () => {
    if (isFunction(controller.destructor)) {
      controller.destructor();
    }
  });

  return controller;
};

let getValentInfo = (componentModel) => {
  return {
    type: 'component',
    name: componentModel.getName(),
    namespace: componentModel.getNamespace()
  };
};

let translateRestrict = (componentModel) => {
  let restrict = 'E';

  // TODO: check if we need to compile directive with restrict A
  if (componentModel.withoutTemplate() && !componentModel.hasCompileMethod()) {
    restrict = 'A';
  }

  return restrict;
};

let translateParams = (componentModel) => {
  let params = componentModel.getParams();
  let angularScope = null;

  if (componentModel.isIsolated()) {
    angularScope = Object.assign({}, params);

    //if (componentModel.hasInterfaces()) {
    //  let interfaces = componentModel.getInterfaces();
    //
    //  for (let key of Object.keys(interfaces)) {
    //    angularScope[key] = '=';
    //  }
    //}
    //
    //if (componentModel.hasOptions()) {
    //  let options = componentModel.getOptions();
    //
    //  for (let key of Object.keys(options)) {
    //    angularScope[key] = '=';
    //  }
    //}
    //
    //if (componentModel.hasPipes()) {
    //  let pipes = componentModel.getPipes();
    //
    //  for (let key of Object.keys(pipes)) {
    //    angularScope[key] = '=';
    //  }
    //}
  } else {
    angularScope = false;
  }

  return angularScope;
};

let getInterfaces = (directiveParams, componentModel) => {
  let instances = [];
  let interfaces = componentModel.getInterfaces();

  for (let key of Object.keys(interfaces)) {
    let instance = directiveParams.parse(key);

    if (!instance) {
      throw Error(`directive should implements interface "${key}"`);
    }

    let InterfaceClass = interfaces[key];

    if (!(instance instanceof InterfaceClass)) {
      throw Error(`interface "${key}" has wrong class`);
    }

    instances.push(instance);
  }

  return instances;
};

let getOptions = (directiveParams, componentModel) => {
  let instances = [];

  let options = componentModel.getOptions();

  for (let key of Object.keys(options)) {
    let interfaceInstance = directiveParams.parse(key);

    let instance = null;
    if (interfaceInstance) {

      let InterfaceClass = options[key];

      if (!(interfaceInstance instanceof InterfaceClass)) {
        throw Error(`interface "${key}" has wrong class`);
      }

      instance = $scope[key];
    }

    instances.push(instance);
  }

  return instances;
};

let getRequiredControllers = (componentModel, require) => {
  let controllers = {};
  let configure = componentModel.getRequire();
  let index = 0;

  for (let required of require) {
    if (required) {
      let api = null;

      let key = configure[index];
      let normalized = key.replace(/[\?\^]*/, '');

      if (required.hasOwnProperty('$valent')) {
        // means that required component - valent component
        let namespace = required.$valent.namespace;
        api = required[namespace];

        if (!api) {
          throw new Error(`"${normalized}" component has no api`);
        }
      } else {
        // means that required component - valent component
        api = required;
      }


      controllers[normalized] = api;
    }

    index++;
  }

  return controllers;
};

export default (componentModel) => {
  let module = componentModel.getModule();
  let controller = null;


  let link = (params, $scope, element, attrs, require) => {
    if (controller.link) {
      let requiredControllers = {};
      let args = [element];

      if (isArray(require)) {
        requiredControllers = getRequiredControllers(componentModel, require);
        args.push(requiredControllers);
      }

      let compile = Compiler($scope);
      args.push(compile);

      controller.link(...args);
      //controller.link(element, attrs, requiredControllers, compile);
    }

    // GC
    controller = null;
  };

  let configuration = {
    replace: false,
    transclude: componentModel.getTransclude(),
    restrict: translateRestrict(componentModel),
    scope: translateParams(componentModel),
    require: componentModel.getRequire(),
    controller: ['$scope', '$attrs', '$element', function($scope, $attrs, $element) {
      let valentInfo = getValentInfo(componentModel);
      let namespace = valentInfo.namespace;

      $scope.$valent = valentInfo;
      this.$valent = valentInfo;

      let instances = [];
      let directiveParams = new DirectiveParams($scope, $attrs, $element, componentModel);

      if (componentModel.hasInterfaces()) {
        let interfaces = getOptions(directiveParams, componentModel);
        instances.concat(interfaces);
      }

      if (componentModel.hasOptions()) {
        let options = getOptions(directiveParams, componentModel);
        instances.concat(options);
      }

      let Controller = componentModel.getController();
      let name = componentModel.getName();

      let logger = Logger.create(name);

      // controller - closed variable
      controller = new Controller(...instances, directiveParams, logger);

      Scope.attach(controller, $scope);

      if (componentModel.isIsolated()) {
        $scope[namespace] = controller;
      }

      // used for requiring
      this[namespace] = controller.api;

      // $scope events
      $scope.$on('$destroy', () => {
        if (isFunction(controller.destructor)) {
          controller.destructor();
        }
      });
    }],

    link: ($scope, element, attrs, require) => {
      link(null, $scope, element, attrs, require)
    }
  };

  let Controller = componentModel.getController();

  if (isFunction(Controller.compile)) {
    configuration.compile = (element, attrs) => {
      let params = Controller.compile(element, attrs);

      return ($scope, element, attrs, require) => {
        link(params, $scope, element, attrs, require);
      }
    };
  }

  if (componentModel.hasTemplate()) {
    configuration.template = componentModel.getTemplate();
  } else if (componentModel.hasTemplateUrl()) {
    configuration.templateUrl = componentModel.getTemplateUrl();
  }

  return {
    name: componentModel.getDirectiveName(),
    module,
    configuration
  }
}
